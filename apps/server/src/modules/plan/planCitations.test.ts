import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DesignBrief } from "@repo/schemas"

const m = vi.hoisted(() => ({
  report: null as null | { id: string; citationRows: Array<{ findingId: string; decisionArea: string }> },
  save: vi.fn(async (_id: string, _rows: unknown[]) => null),
}))
vi.mock("@useframe/db", () => ({ prisma: { researchReport: { findUnique: async () => m.report } } }))
vi.mock("bullmq", () => ({ Queue: class {} }))
vi.mock("@/lib/redis.js", () => ({ redis: {} }))
vi.mock("@/lib/researchService.js", () => ({
  callGetFinding: vi.fn(),
  callGetProjectResearch: vi.fn(),
  callSaveCitations: m.save,
}))

const { keepChosenBriefCitations } = await import("./plan.service.js")

const field = { rationale: "", citation: "" }
const brief = (citations: string[], colorCitation = ""): DesignBrief => ({
  product: "Kids app",
  audience: { primary: "children" },
  goal: "Sign up parents",
  brand: { personality: "playful", positioning: "mid", tone: "warm" },
  colors: { primary: "#111", secondary: "#222", accent: "#333", rationale: "", citation: colorCitation },
  typography: { primary: "Inter", secondary: "Inter", minSize: "18px", ...field },
  layout: { sections: ["HERO"], ...field },
  copyFramework: "AIDA",
  frameworkRationale: "",
  density: "low",
  motion: "subtle",
  accessibility: { minContrast: "4.5:1", touchTarget: "44px" },
  avoid: [],
  citations: citations.map((id) => ({ id, title: id, source: "Research library" })),
})

describe("keepChosenBriefCitations", () => {
  beforeEach(() => {
    m.save.mockClear()
    m.report = {
      id: "report-1",
      citationRows: [
        { findingId: "a", decisionArea: "TYPOGRAPHY" },
        { findingId: "a", decisionArea: "ACCESSIBILITY" },
        { findingId: "b", decisionArea: "COLOR" },
        { findingId: "c", decisionArea: "LAYOUT" },
      ],
    }
  })

  it("keeps only the chosen brief's findings", async () => {
    await keepChosenBriefCitations("p1", brief(["a"], "b"))
    expect(m.save).toHaveBeenCalledWith("report-1", m.report!.citationRows.slice(0, 3))
  })

  it("does nothing when every saved citation is still used", async () => {
    await keepChosenBriefCitations("p1", brief(["a", "b", "c"]))
    expect(m.save).not.toHaveBeenCalled()
  })

  it("ignores a missing report or a malformed brief", async () => {
    await keepChosenBriefCitations("p1", { colors: {} })
    m.report = null
    await keepChosenBriefCitations("p1", brief([]))
    expect(m.save).not.toHaveBeenCalled()
  })
})
