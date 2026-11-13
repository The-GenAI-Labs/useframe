import { describe, expect, it } from "vitest"
import type { RetrievalResult } from "@repo/schemas"
import { formatCorpus } from "./planner.prompt.js"

const finding = (id: string, statement = "") => ({
  findingId: id,
  slug: id,
  title: `Title ${id}`,
  statement,
  appliesWhen: null,
  category: "TYPOGRAPHY" as const,
  rrfScore: 0.01,
  rerankScore: 0.5,
  viaRelation: false,
})

describe("formatCorpus", () => {
  it("lists at most 4 findings per area and clips statements to 500 chars", () => {
    const areas: RetrievalResult["areas"] = [
      {
        area: "TYPOGRAPHY",
        hydePassage: "",
        findings: ["a", "b", "c", "d", "e", "f"].map((id) => finding(id, "x".repeat(600))),
      },
    ]
    const text = formatCorpus(areas)
    expect(text.match(/findingId:/g)).toHaveLength(4)
    expect(text).not.toContain('"e"')
    expect(text).toContain(`${"x".repeat(500)}…`)
    expect(text).not.toContain("x".repeat(501))
  })

  it("refers back to a finding already listed in an earlier area", () => {
    const areas: RetrievalResult["areas"] = [
      { area: "TYPOGRAPHY", hydePassage: "", findings: [finding("a")] },
      { area: "LAYOUT", hydePassage: "", findings: [finding("a")] },
      { area: "COLOR", hydePassage: "", findings: [] },
    ]
    const text = formatCorpus(areas)
    expect(text).toContain('## LAYOUT\n- findingId: "a" (listed above)')
    expect(text).not.toContain("## COLOR")
  })
})
