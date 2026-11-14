import { describe, expect, it, vi } from "vitest"
import type { DesignBrief, RetrievalResult } from "@repo/schemas"

const db = vi.hoisted(() => ({
  findings: vi.fn(async (_args: unknown) => [{ id: "corpus-1" }, { id: "legacy-1" }]),
  report: vi.fn(async (_args: unknown) => null as { id: string } | null),
  upsert: vi.fn(async (_args: unknown) => ({ id: "report-1" })),
  save: vi.fn(async (_id: string, _rows: unknown[]) => {}),
}))
vi.mock("@useframe/db", () => ({
  prisma: {
    researchFinding: { findMany: db.findings },
    researchReport: { findUnique: db.report, upsert: db.upsert },
  },
}))
vi.mock("@/lib/researchService.js", () => ({ retrieveForProject: vi.fn(), saveCitations: db.save }))

const { planCitations, reportFromBrief, savePlanCitations } = await import("./planCitations.js")

const field = { rationale: "", citation: "" }
const brief = (patch: Partial<DesignBrief> = {}): DesignBrief => ({
  product: "Kids app",
  audience: { primary: "children" },
  goal: "Sign up parents",
  brand: { personality: "playful", positioning: "mid", tone: "warm" },
  colors: { primary: "#111", secondary: "#222", accent: "#333", ...field },
  typography: { primary: "Inter", secondary: "Inter", minSize: "18px", ...field },
  layout: { sections: ["HERO", "CTA"], ...field },
  copyFramework: "AIDA",
  frameworkRationale: "",
  density: "low",
  motion: "subtle",
  accessibility: { minContrast: "4.5:1", touchTarget: "44px" },
  avoid: [],
  citations: [],
  ...patch,
})
const finding = (findingId: string, rrfScore: number, viaRelation = false) => ({
  findingId,
  slug: findingId,
  title: findingId,
  statement: "",
  appliesWhen: null,
  category: "TYPOGRAPHY" as const,
  rrfScore,
  rerankScore: viaRelation ? null : 0.8,
  viaRelation,
})
const corpus: RetrievalResult["areas"] = [
  { area: "TYPOGRAPHY", hydePassage: "", findings: [finding("uncited", 0.05), finding("corpus-1", 0.03)] },
  { area: "ACCESSIBILITY", hydePassage: "", findings: [finding("corpus-1", 0.02, true)] },
]
const legacy = [
  {
    decision: "primary_color",
    findings: [{ id: "legacy-1", claim: "", paper: "", decision: "primary_color", options: [], rrfScore: 0.04, rerankScore: 0.6, viaRelation: false }],
  },
  { decision: "unknown_decision", findings: [{ id: "legacy-2", claim: "", paper: "", decision: "x", options: [] }] },
]

describe("plan citations", () => {
  it("keeps only cited findings with their retrieval area, rank, scores and reasoning", () => {
    const rows = planCitations(
      [
        brief({ citations: [{ id: "corpus-1", title: "T", source: "Research library", relevance: "Larger type for early readers" }] }),
        brief({ colors: { primary: "#1", secondary: "#2", accent: "#3", rationale: "Calm palette", citation: "legacy-1" } }),
      ],
      legacy,
      corpus,
    )
    expect(rows).toEqual([
      { findingId: "corpus-1", decisionArea: "TYPOGRAPHY", rank: 1, rrfScore: 0.03, rerankScore: 0.8, viaRelation: false, reasoning: "Larger type for early readers" },
      { findingId: "corpus-1", decisionArea: "ACCESSIBILITY", rank: 0, rrfScore: 0.02, rerankScore: null, viaRelation: true, reasoning: "Larger type for early readers" },
      { findingId: "legacy-1", decisionArea: "COLOR", rank: 0, rrfScore: 0.04, rerankScore: 0.6, viaRelation: false, reasoning: "Calm palette" },
    ])
  })

  it("drops citations to findings that were never retrieved", () => {
    expect(planCitations([brief({ citations: [{ id: "invented", title: "", source: "" }] })], legacy, corpus)).toEqual([])
  })

  it("creates the report once, drops unknown finding ids and replaces the saved set", async () => {
    const rows = planCitations(
      [brief({ citations: [{ id: "corpus-1", title: "", source: "" }, { id: "mock-layout-1", title: "", source: "" }] })],
      [{ decision: "layout", findings: [{ id: "mock-layout-1", claim: "", paper: "", decision: "layout", options: [] }] }],
      corpus,
    )
    expect(rows.map((r) => r.findingId)).toContain("mock-layout-1")
    const saved = await savePlanCitations("project-1", rows, reportFromBrief(brief()))
    expect(saved.map((r) => r.findingId)).toEqual(["corpus-1", "corpus-1"])
    expect(db.upsert).toHaveBeenCalledOnce()
    expect(db.save).toHaveBeenLastCalledWith("report-1", saved)
    db.report.mockResolvedValueOnce({ id: "report-1" })
    await savePlanCitations("project-1", [], reportFromBrief(brief()))
    expect(db.upsert).toHaveBeenCalledOnce()
    expect(db.save).toHaveBeenLastCalledWith("report-1", [])
  })

  it("does not create an empty report when nothing was cited", async () => {
    db.upsert.mockClear()
    db.save.mockClear()
    await savePlanCitations("project-2", [], reportFromBrief(brief()))
    expect(db.upsert).not.toHaveBeenCalled()
    expect(db.save).not.toHaveBeenCalled()
  })
})
