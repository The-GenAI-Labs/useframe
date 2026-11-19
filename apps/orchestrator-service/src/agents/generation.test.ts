import { describe, expect, it, vi } from "vitest"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV1 } from "ai/test"
import type { Response } from "express"
import { z } from "zod"
import { checkSpecQuality, isPlaceholder, type GenerateRequest, type Section, type SiteSpec } from "@repo/schemas"

vi.mock("@useframe/db", () => ({ prisma: {}, briefStateOf: () => ({}), latestBriefRevision: async () => null, writeBriefFields: async () => ({}) }))

const { generateValidated } = await import("@/llm/structured.js")
const { runCopyAgent } = await import("./copy.agent.js")
const { structureFromModelOutput, separateLayouts } = await import("./structure.agent.js")
const { applyCritiquePatches } = await import("./critique.agent.js")
const { colorIssues, designSystemFrom, fallbackDesign } = await import("@/lib/designTheme.js")
const { clampText, fallbackContent, fallbackSource } = await import("@/lib/copyQuality.js")
const { DEFAULT_STRUCTURE_PROMPT } = await import("@/prompts/structure.prompt.js")
const { DEFAULT_COPY_PROMPT } = await import("@/prompts/copy.prompt.js")
const { DEFAULT_DESIGN_PROMPT } = await import("@/prompts/design.prompt.js")
const { DEFAULT_CRITIQUE_PROMPT } = await import("@/prompts/critique.prompt.js")

const usage = { promptTokens: 10, completionTokens: 10 }
const rawCall = { rawPrompt: null, rawSettings: {} }

// Answers each call with the next payload, as text and as a stream.
function scriptedModel(payloads: unknown[]) {
  const prompts: string[] = []
  const next = (prompt: unknown) => {
    prompts.push(JSON.stringify(prompt))
    const payload = payloads[Math.min(prompts.length - 1, payloads.length - 1)]
    return typeof payload === "string" ? payload : JSON.stringify(payload)
  }
  const model = new MockLanguageModelV1({
    defaultObjectGenerationMode: "json",
    doGenerate: async ({ prompt }) => ({ rawCall, finishReason: "stop", usage, text: next(prompt) }),
    doStream: async ({ prompt }) => ({
      rawCall,
      stream: simulateReadableStream({
        chunks: [
          { type: "text-delta" as const, textDelta: next(prompt) },
          { type: "finish" as const, finishReason: "stop" as const, usage },
        ],
      }),
    }),
  })
  return { model, prompts }
}

function fakeRes() {
  const events: { type: string }[] = []
  const res = { write: (chunk: string) => events.push(JSON.parse(chunk.split("data: ")[1]!.trim())), destroyed: false, writableEnded: false } as unknown as Response
  return { res, events }
}

const request: GenerateRequest = {
  startupIdea: "Booking software that lets dental clinics fill cancelled appointments from a waitlist",
  niche: "HEALTH_WELLNESS",
  targetAudience: "owners of independent dental clinics",
  inputType: "FROM_SCRATCH",
  name: "Brightdesk",
  tier: "free",
} as GenerateRequest

const plannedSpec = (): Partial<SiteSpec> => ({
  siteType: "SINGLE_PAGE",
  copyFramework: "PAS",
  pages: [
    {
      type: "HOME",
      slug: "home",
      title: "Brightdesk",
      sections: [
        { type: "HERO", index: 0, variant: "split", purpose: "Promise" },
        { type: "FEATURES", index: 1, variant: "grid", purpose: "Capabilities" },
        { type: "FAQ", index: 2, variant: "accordion", purpose: "Objections" },
        { type: "CTA", index: 3, variant: "banner", purpose: "Close" },
        { type: "FOOTER", index: 4 },
      ],
    },
  ],
})

const goodCopy = {
  primaryCta: "Start free trial",
  sections: [
    { index: 0, eyebrow: "For dental clinics", headline: "Fill cancelled chairs from your waitlist", subheadline: "Brightdesk offers every freed slot to waiting patients by text, so your day stays full.", cta: { primary: "Start free trial", secondary: "See how it works" } },
    {
      index: 1,
      headline: "Less phone tag for your front desk",
      items: [
        { title: "Waitlist that refills itself", description: "Cancelled slots go to the next patient on the list automatically.", icon: "refresh" },
        { title: "Two-tap confirmations", description: "Patients confirm or move visits from a text message.", icon: "message" },
        { title: "Your real calendar", description: "Bookings sync with the schedule your team already uses.", icon: "calendar" },
      ],
    },
    {
      index: 2,
      headline: "Questions clinics ask",
      items: [
        { title: "How long does setup take?", description: "Most clinics connect their calendar and invite staff in an afternoon." },
        { title: "Is patient data private?", description: "Only your team sees patient details; texts carry no medical information." },
        { title: "Can we cancel anytime?", description: "Yes. Plans are monthly and you can stop from your settings page." },
        { title: "Does it suit small clinics?", description: "It is built for independent clinics with one to five chairs." },
      ],
    },
    { index: 3, headline: "Keep every chair booked this month", subheadline: "Turn cancellations into filled appointments.", cta: { primary: "Try it free" } },
  ],
}

describe("generateValidated", () => {
  const schema = z.object({ headline: z.string() })

  it("retries once with the exact problems", async () => {
    const { model, prompts } = scriptedModel(["not json at all", { headline: "Fill every chair" }])
    const out = await generateValidated({ model, schema, prompt: "write", functionId: "t" })
    expect(out).toMatchObject({ object: { headline: "Fill every chair" }, issues: [], attempts: 2 })
    expect(prompts[1]).toContain("YOUR PREVIOUS ANSWER WAS REJECTED")
  })

  it("settles instead of hanging when the provider errors mid-stream", async () => {
    const model = new MockLanguageModelV1({
      defaultObjectGenerationMode: "json",
      doStream: async () => ({
        rawCall,
        stream: simulateReadableStream({ chunks: [{ type: "error" as const, error: new Error("credit balance is too low") }] }),
      }),
    })
    const out = await generateValidated({ model, schema, prompt: "write", functionId: "t", onDelta: () => {} })
    expect(out.object).toBeNull()
    expect(out.issues[0]).toMatch(/Model call failed: credit balance is too low/)
  })

  it("returns the remaining issues after the second failure", async () => {
    const { model } = scriptedModel([{ headline: "HERO Section" }])
    const out = await generateValidated({ model, schema, prompt: "write", functionId: "t", validate: (o) => (isPlaceholder(o.headline) ? ["placeholder"] : []) })
    expect(out.issues).toEqual(["placeholder"])
    expect(out.attempts).toBe(2)
  })
})

describe("copy agent", () => {
  it("writes the whole page in one call and keeps one primary CTA label", async () => {
    const { model, prompts } = scriptedModel([goodCopy])
    const { res, events } = fakeRes()
    const out = await runCopyAgent(res, plannedSpec(), request, model)
    expect(prompts).toHaveLength(1)
    const sections = out.pages![0]!.sections
    expect(sections.find((s) => s.type === "CTA")!.content!.cta!.primary).toBe("Start free trial")
    expect(sections.find((s) => s.type === "FOOTER")!.content).toEqual({})
    expect(events.filter((e) => e.type === "section_complete")).toHaveLength(5)
    expect(checkSpecQuality({ pages: out.pages! }, { facts: request.startupIdea }).filter((i) => i.code !== "adjacent_variant")).toEqual([])
  })

  it("never lets placeholder or banned copy reach the page", async () => {
    const bad = {
      primaryCta: "Click",
      sections: [0, 1, 2, 3].map((index) => ({ index, headline: index === 0 ? "HERO Section" : "A seamless, cutting-edge experience", items: [] })),
    }
    const { model, prompts } = scriptedModel([bad])
    const out = await runCopyAgent(fakeRes().res, plannedSpec(), request, model)
    expect(prompts).toHaveLength(2)
    const sections = out.pages![0]!.sections
    // Without brief facts there is nothing honest to say in FEATURES or FAQ, so they are dropped.
    expect(sections.map((s) => s.type)).toEqual(["HERO", "CTA", "FOOTER"])
    const text = JSON.stringify(sections)
    expect(text).not.toMatch(/Section"|seamless|cutting-edge/i)
    for (const s of sections) expect(isPlaceholder(s.content?.headline ?? "ok")).toBe(false)
    expect(sections[0]!.content!.cta!.primary).toBe(sections[1]!.content!.cta!.primary)
  })

  it("falls back to the user's own brief facts", () => {
    const src = { ...fallbackSource(request, null), features: [{ title: "Waitlist refill", benefit: "Freed slots are offered to waiting patients by text." }, { title: "Reminders", benefit: "Patients get a text two days before their visit." }] }
    const features = fallbackContent("FEATURES", "bento", src)!
    expect(features.variant).toBe("grid")
    expect(features.content.items).toHaveLength(2)
    expect(fallbackContent("CUSTOM", "prose", src)).toBeNull()
    expect(clampText("One two three four five", 13)).toBe("One two three")
  })
})

describe("structure", () => {
  it("keeps closed menus, honest sections, HERO first, FOOTER last and varied layouts", () => {
    const out = structureFromModelOutput(
      {
        siteType: "SINGLE_PAGE",
        copyFramework: "PAS",
        pages: [
          {
            type: "HOME",
            slug: "Home Page!",
            title: "x",
            sections: [
              { type: "FEATURES", variant: "grid", purpose: "Capabilities" },
              { type: "HOW_IT_WORKS", variant: "steps" },
              { type: "HERO", variant: "bogus" },
              { type: "WIDGETS" },
              { type: "FAQ", variant: "accordion" },
            ],
          },
        ],
      },
      null,
      undefined,
      "Brightdesk",
    )
    const page = out.pages[0]!
    expect(page).toMatchObject({ slug: "home", title: "Brightdesk" })
    expect(page.sections.map((s) => s.type)).toEqual(["HERO", "FEATURES", "HOW_IT_WORKS", "FAQ", "FOOTER"])
    expect(page.sections.map((s) => s.index)).toEqual([0, 1, 2, 3, 4])
    expect(page.sections[0]!.variant).toBeUndefined()
    expect(page.sections[2]!.variant).toBe("timeline")
    expect(page.sections[2]!.purpose).toMatch(/effort/)
  })

  it("steps a section to another variant instead of repeating a layout", () => {
    const out = separateLayouts<Pick<Section, "type" | "variant">>([
      { type: "FEATURES", variant: "grid" },
      { type: "TESTIMONIALS", variant: "cards" },
    ])
    expect(out[1]!.variant).toBe("featured")
  })
})

describe("critique patches", () => {
  const spec = (): Partial<SiteSpec> => ({ ...plannedSpec(), theme: { preset: "minimal" }, pages: [{ ...plannedSpec().pages![0]!, sections: plannedSpec().pages![0]!.sections.map((s) => ({ ...s, content: goodCopy.sections.find((c) => c.index === s.index) ?? {} })) }] })

  it("applies valid patches and rejects anything that breaks the rules", () => {
    const { spec: out, applied, rejected } = applyCritiquePatches(
      spec(),
      [
        { op: "content", pageSlug: "home", sectionIndex: 0, field: "headline", value: "Turn cancellations into booked chairs" },
        { op: "content", pageSlug: "home", sectionIndex: 1, field: "headline", value: "Trusted by 5,000 clinics" },
        { op: "content", pageSlug: "home", sectionIndex: 0, field: "subheadline", value: "A seamless experience" },
        { op: "content", pageSlug: "home", sectionIndex: 4, field: "headline", value: "x" },
        { op: "variant", pageSlug: "home", sectionIndex: 1, variant: "bento" },
        { op: "variant", pageSlug: "home", sectionIndex: 2, variant: "bento" },
        { op: "move", pageSlug: "home", sectionIndex: 3, toPosition: 0 },
        { op: "move", pageSlug: "home", sectionIndex: 2, toPosition: 1 },
        { op: "theme", token: "density", value: "airy" },
        { op: "theme", token: "density", value: "huge" },
      ],
      request.startupIdea,
    )
    expect(applied).toBe(4)
    expect(rejected).toHaveLength(6)
    const sections = out.pages![0]!.sections
    expect(sections[0]!.content!.headline).toBe("Turn cancellations into booked chairs")
    expect(sections.map((s) => s.type)).toEqual(["HERO", "FAQ", "FEATURES", "CTA", "FOOTER"])
    expect(sections.find((s) => s.type === "FEATURES")!.variant).toBe("bento")
    expect(out.theme).toEqual({ preset: "minimal", density: "airy" })
  })
})

describe("design", () => {
  it("checks colours and never falls back to indigo", () => {
    expect(colorIssues({ primaryColor: "#6366F1", secondaryColor: "#EEF2FF", accentColor: "#F59E0B" })).toEqual(
      expect.arrayContaining([expect.stringContaining("indigo")]),
    )
    expect(colorIssues({ primaryColor: "#0F766E", secondaryColor: "#E6F2F1", accentColor: "#14837A" })).toEqual([expect.stringContaining("distinct")])
    for (const niche of ["FINTECH", "SAAS_B2B", "KIDS", "LUXURY", "OTHER", "UNKNOWN"]) {
      const choice = fallbackDesign(niche)
      expect(colorIssues(choice), niche).toEqual([])
      expect(choice.primaryColor.toLowerCase()).not.toBe("#6366f1")
    }
    expect(designSystemFrom(fallbackDesign("KIDS"))).toMatchObject({ fontPrimary: "Fredoka", fontSecondary: "Nunito", borderRadius: "full" })
  })
})

describe("prompts", () => {
  it("structure prompt", () => {
    expect(DEFAULT_STRUCTURE_PROMPT({ startupIdea: "Idea", niche: "FINTECH", targetAudience: "Freelancers", inputType: "FROM_SCRATCH" })).toMatchSnapshot()
  })
  it("copy prompt", () => {
    expect(
      DEFAULT_COPY_PROMPT({
        copyFramework: "PAS",
        startupIdea: "Idea",
        productName: "Brightdesk",
        niche: "HEALTH_WELLNESS",
        targetAudience: "Clinic owners",
        pageTitle: "Home",
        pageType: "HOME",
        sections: [{ index: 0, type: "HERO", variant: "split", purpose: "Promise", contract: "headline required (≤70)" }],
      }),
    ).toMatchSnapshot()
  })
  it("design prompt", () => {
    expect(DEFAULT_DESIGN_PROMPT({ startupIdea: "Idea", niche: "KIDS", targetAudience: "Parents" })).toMatchSnapshot()
  })
  it("critique prompt", () => {
    expect(DEFAULT_CRITIQUE_PROMPT({ specSummary: "{}", measurements: "none", startupIdea: "Idea", niche: "KIDS", targetAudience: "Parents" })).toMatchSnapshot()
  })
})
