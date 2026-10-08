import { beforeEach, describe, expect, it, vi } from "vitest"
import { MockLanguageModelV1 } from "ai/test"
import type { BriefData, BriefMeta } from "@repo/schemas"

type Row = { id: string; userId: string; projectId: string | null; status: string; version: number; data: BriefData; meta: BriefMeta; resolution?: unknown }

const { store, revisions } = vi.hoisted(() => ({ store: new Map<string, Row>(), revisions: [] as string[] }))

vi.mock("@useframe/db", async () => {
  const { applyBriefChanges } = await import("@repo/schemas")
  return {
    briefStateOf: (row: Row) => ({ data: row.data ?? {}, meta: row.meta ?? {} }),
    prisma: {
      projectBrief: {
        findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
          const row = store.get(where.id)
          return row && row.userId === where.userId ? structuredClone(row) : null
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => structuredClone(store.get(where.id)!),
      },
      pipelineLog: { create: async () => ({}) },
    },
    writeBriefFields: async (p: {
      briefId: string
      changes: Parameters<typeof applyBriefChanges>[1]
      source: Parameters<typeof applyBriefChanges>[2]["source"]
      confidence?: Record<string, number>
      columns?: Record<string, unknown>
      revisionReason?: string
    }) => {
      const cur = store.get(p.briefId)!
      const applied = applyBriefChanges({ data: cur.data, meta: cur.meta }, p.changes, { source: p.source, confidence: p.confidence })
      const next = { ...cur, ...p.columns, data: applied.data, meta: applied.meta, version: cur.version + 1 } as Row
      store.set(p.briefId, next)
      if (p.revisionReason) revisions.push(p.revisionReason)
      return { brief: structuredClone(next), changed: applied.changed, skipped: applied.skipped, revision: null }
    },
  }
})

const { resolveBrief } = await import("./briefResolve.agent.js")

const quick: BriefData = {
  productName: "Ledgerly",
  oneLiner: "  Ledgerly turns bank exports   into tidy monthly books.  ",
  productType: "SOFTWARE_SAAS",
  availability: "LIVE",
  primaryGoal: "FREE_TRIAL",
  audienceDescription: "Freelance designers",
  problem: "Freelancers lose a weekend every quarter on receipts.",
  features: [
    { title: "Auto-categorise", benefit: "Bank lines sorted without effort." },
    { title: "Auto-categorise", benefit: "Bank lines sorted without effort." },
    { title: "Receipt match", benefit: "Photos matched to the right line." },
  ],
  ctaPrimary: { label: "Start free", type: "URL", url: "https://ledgerly.app/signup" },
  contactEmail: "hi@ledgerly.app",
  competitors: [{ name: "QuickBooks" }],
}

function userMeta(data: BriefData): BriefMeta {
  return Object.fromEntries(Object.keys(data).map((k) => [k, { source: "user", confirmed: true, updatedAt: "2026-10-01T00:00:00.000Z" }]))
}

function seed(data: BriefData = quick): void {
  store.set("brief1", { id: "brief1", userId: "user1", projectId: "proj1", status: "RESOLVING", version: 3, data: structuredClone(data), meta: userMeta(data) })
}

function scriptedModel(responses: (unknown | Error)[]) {
  let call = 0
  const model = new MockLanguageModelV1({
    defaultObjectGenerationMode: "json",
    doGenerate: async () => {
      const next = responses[Math.min(call++, responses.length - 1)]
      if (next instanceof Error) throw next
      return {
        rawCall: { rawPrompt: null, rawSettings: {} },
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
        text: JSON.stringify(next),
      }
    },
  })
  return { model, calls: () => call }
}

beforeEach(() => {
  store.clear()
  revisions.length = 0
})

describe("resolveBrief", () => {
  it("drafts only assume fields, never proof, and leaves claims unconfirmed", async () => {
    seed()
    const { model, calls } = scriptedModel([
      {
        fields: {
          valueProp: { value: "Monthly books without the weekend of receipts.", confidence: 0.7 },
          audienceSegment: { value: "B2C", confidence: 0.6 },
          testimonials: { value: [{ quote: "Amazing product, really.", personName: "Ana", permissionConfirmed: true }] },
          trustedBy: { value: ["Apple"] },
          pricing: { value: { mode: "SHOW_PLANS", plans: [] } },
        },
      },
    ])
    const outcome = await resolveBrief("brief1", "user1", model)
    const row = store.get("brief1")!

    expect(outcome.status).toBe("AWAITING_REVIEW")
    expect(calls()).toBe(1)
    expect(row.status).toBe("AWAITING_REVIEW")
    expect(row.meta.valueProp).toMatchObject({ source: "assumed", confirmed: false })
    expect(row.data.testimonials).toBeUndefined()
    expect(row.data.trustedBy).toBeUndefined()
    expect(row.data.pricing).toEqual({ mode: "HIDE" })
    expect(row.meta.pricing?.source).toBe("default")
    expect(row.data.companyName).toBe("Ledgerly")
    expect(row.data.oneLiner).toBe("Ledgerly turns bank exports into tidy monthly books.")
    expect(row.data.features).toHaveLength(2)
  })

  it("retries a rejected claim once, then drops it", async () => {
    seed()
    const { model, calls } = scriptedModel([
      { fields: { valueProp: { value: "The best bookkeeping tool, better than QuickBooks." }, differentiators: { value: ["Only tool with 2 clicks"] } } },
      { fields: { valueProp: { value: "Calm, tidy books every month." }, differentiators: { value: ["Fastest setup around"] } } },
    ])
    const outcome = await resolveBrief("brief1", "user1", model)
    const row = store.get("brief1")!
    expect(calls()).toBe(2)
    expect(row.data.valueProp).toBe("Calm, tidy books every month.")
    expect(row.data.differentiators).toBeUndefined()
    expect(outcome.dropped).toContain("differentiators")
    expect((row.resolution as { dropped: string[] }).dropped).toContain("differentiators")
  })

  it("fails safe when the model errors: nothing assumed, review with a notice", async () => {
    seed()
    const { model } = scriptedModel([new Error("provider down")])
    const outcome = await resolveBrief("brief1", "user1", model)
    const row = store.get("brief1")!
    expect(outcome).toMatchObject({ status: "AWAITING_REVIEW", failed: true })
    expect(row.status).toBe("AWAITING_REVIEW")
    expect(row.resolution).toMatchObject({ notice: "resolve_failed" })
    expect(row.data.valueProp).toBeUndefined()
  })

  it("approves straight away when nothing needs assuming", async () => {
    seed({
      ...quick,
      audienceSegment: "B2C",
      audienceDetails: { techLevel: "LOW" },
      valueProp: "Monthly books without the weekend of receipts.",
      howItWorks: { steps: [{ title: "Connect", description: "Link your bank." }, { title: "Review", description: "Check the books." }] },
      differentiators: ["Built for freelancers"],
      currentAlternative: "Spreadsheets",
      faq: [{ q: "Is there a trial?", a: "Yes." }],
      objections: "Price",
      trafficSources: ["GOOGLE_SEARCH"],
    })
    const { model, calls } = scriptedModel([{ fields: {} }])
    const outcome = await resolveBrief("brief1", "user1", model)
    expect(calls()).toBe(0)
    expect(outcome.status).toBe("APPROVED")
    expect(store.get("brief1")!.status).toBe("APPROVED")
    expect(revisions).toEqual(["APPROVED"])
  })

  it("refuses another user's brief", async () => {
    seed()
    const { model } = scriptedModel([{ fields: {} }])
    await expect(resolveBrief("brief1", "someone-else", model)).rejects.toThrow("Brief not found")
  })
})
