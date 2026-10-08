import { describe, expect, it, vi } from "vitest"
import { toPipelineInput, type BriefData, type SiteSpec } from "@repo/schemas"

vi.mock("@useframe/db", () => ({ prisma: {}, briefStateOf: () => ({}), latestBriefRevision: async () => null, writeBriefFields: async () => ({}) }))

const { applyBriefToSpec, allowedSectionTypes, deterministicContent, filterSections } = await import("./briefPipeline.js")

const caps = { formHandler: false, legalPages: false, languages: ["en"] }

function ctxFor(data: BriefData) {
  return { briefId: "b1", input: toPipelineInput({ data, meta: {} }, caps), data, revisionId: "r1" }
}

const base: BriefData = {
  productName: "Ledgerly",
  ctaPrimary: { label: "Start free", type: "URL", url: "https://ledgerly.app/signup" },
  contactEmail: "hi@ledgerly.app",
  competitors: [{ name: "QuickBooks" }],
}

const spec = (sections: SiteSpec["pages"][number]["sections"]): Partial<SiteSpec> => ({
  pages: [{ type: "HOME", slug: "home", title: "Home", sections }],
})

describe("brief-driven generation", () => {
  it("removes sections the brief can't back", () => {
    const ctx = ctxFor(base)
    expect(allowedSectionTypes(ctx)).not.toContain("TESTIMONIALS")
    expect(allowedSectionTypes(ctx)).not.toContain("PRICING")
    expect(filterSections([{ type: "HERO" }, { type: "TESTIMONIALS" }, { type: "PRICING" }, { type: "TEAM" }], ctx)).toEqual([{ type: "HERO" }])
  })

  it("uses the user's testimonials verbatim and never a model's", () => {
    const ctx = ctxFor({
      ...base,
      testimonials: [{ quote: "Saved my weekends.", personName: "Ana Ruiz", role: "Designer", permissionConfirmed: true }],
      proofAttested: true,
    })
    const out = applyBriefToSpec(
      spec([{ type: "TESTIMONIALS", index: 0, content: { headline: "x", items: [{ title: "Tim Cook", description: "Invented" }] } }]),
      ctx,
    )
    expect(out.pages![0]!.sections[0]!.content!.items).toEqual([{ title: "Ana Ruiz, Designer", description: "“Saved my weekends.”" }])
    expect(deterministicContent("PRICING", ctx)?.items).toEqual([])
  })

  it("sets the user's button and strips competitor names", () => {
    const out = applyBriefToSpec(
      spec([
        {
          type: "HERO",
          index: 0,
          content: { headline: "Books, done. Simpler than QuickBooks.", cta: { primary: "Go", primaryHref: "javascript:alert(1)" } },
        },
      ]),
      ctxFor(base),
    )
    const hero = out.pages![0]!.sections[0]!.content!
    expect(hero.headline).toBe("Books, done.")
    expect(hero.cta).toMatchObject({ primary: "Start free", primaryHref: "https://ledgerly.app/signup" })
  })

  it("never emits an unsafe href from the brief", () => {
    const evil = { ...base, ctaPrimary: { label: "Go", type: "URL" as const, url: "javascript:alert(1)" } }
    const out = applyBriefToSpec(spec([{ type: "CTA", index: 0, content: { headline: "x" } }]), ctxFor(evil))
    expect(out.pages![0]!.sections[0]!.content!.cta?.primaryHref).toBeUndefined()
  })
})
