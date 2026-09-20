export type MockFinding = {
  id: string
  claim: string
  paper: string
  field: string
  decision: string
  options: { value: string; label: string; fits: string[] }[]
}

export function mockFindingsFor(decision: string): MockFinding[] {
  return [1, 2, 3].map((n) => ({
    id: `mock-${decision}-${n}`,
    claim: `Mock finding ${n} for ${decision} (RESEARCH_MOCK=true — no real retrieval performed).`,
    paper: "Mock Research Corpus",
    field: decision,
    decision,
    options: [
      { value: `mock-option-a-${n}`, label: `Mock option A${n}`, fits: ["confident", "trustworthy"] },
      { value: `mock-option-b-${n}`, label: `Mock option B${n}`, fits: ["warm", "friendly"] },
    ],
  }))
}
