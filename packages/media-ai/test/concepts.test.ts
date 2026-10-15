import { describe, expect, it } from "vitest"
import { checkConcept, checkConceptSet, findCliche, selectWinner } from "../src/concepts.js"
import { FakeLlm } from "../src/providers/fake.js"
import type { Concept, JudgeScore } from "../src/schemas.js"
import { PALETTE } from "./helpers.js"

async function fakeConcepts(durationSec = 6): Promise<Concept[]> {
  const res = await new FakeLlm().complete({
    routingKey: "media-creative",
    purpose: "media.concepts",
    system: "",
    prompt: `<DATA name="MEDIA_ITEM">\n${JSON.stringify({ durationSec })}\n</DATA>`,
  })
  return (JSON.parse(res.text) as { concepts: Concept[] }).concepts
}

const score = (id: Concept["id"], n: number, veto = false): JudgeScore => ({
  id,
  messageFit: n,
  audienceFit: n,
  memorability: n,
  feasibility: n,
  brandFit: 5,
  veto,
  comment: "",
})

describe("concept checks", () => {
  it("accepts three concepts with distinct mechanisms", async () => {
    const concepts = await fakeConcepts()
    const set = checkConceptSet(concepts, 6, PALETTE)
    expect(set.errors).toEqual([])
    expect(set.valid).toHaveLength(3)
  })

  it("rejects a repeated mechanism", async () => {
    const concepts = await fakeConcepts()
    const same = concepts.map((c) => ({ ...c, mechanism: concepts[0]!.mechanism }))
    const set = checkConceptSet(same, 6, PALETTE)
    expect(set.valid).toHaveLength(1)
    expect(set.errors.join(" ")).toMatch(/already used/)
  })

  it("flags clichés, cuts and beats beyond the duration", async () => {
    const [c] = await fakeConcepts()
    expect(findCliche("A lightbulb moment over a laptop")).toBe("lightbulb moment")
    expect(checkConcept({ ...c!, logline: "A rocket launch from the desk" }, 6, PALETTE).errors.join(" ")).toMatch(/cliché/)
    expect(checkConcept({ ...c!, camera: "hard cut to a close-up" }, 6, PALETTE).errors.join(" ")).toMatch(/continuous/)
    expect(checkConcept(c, 1, PALETTE).errors.join(" ")).toMatch(/beyond 1s/)
  })
})

describe("selectWinner", () => {
  it("chooses by weighted score in code and ignores the judge's winnerId", async () => {
    const concepts = await fakeConcepts()
    const res = selectWinner(concepts, { scores: [score("A", 5), score("B", 5), score("C", 10)], winnerId: "A", directorNotes: [], reason: "x" })
    expect(res.winnerId).toBe("C")
  })

  it("never picks a vetoed concept", async () => {
    const concepts = await fakeConcepts()
    const res = selectWinner(concepts, { scores: [score("A", 10, true), score("B", 6), score("C", 5)], winnerId: "A", directorNotes: [], reason: "x" })
    expect(res.winnerId).toBe("B")
  })
})
