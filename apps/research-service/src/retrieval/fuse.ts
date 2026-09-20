const RRF_K = 60

export type RankedId = { id: string; rank: number }

export function reciprocalRankFusion(rankLists: RankedId[][]): { id: string; score: number }[] {
  const scores = new Map<string, number>()

  for (const rankList of rankLists) {
    for (const { id, rank } of rankList) {
      const current = scores.get(id) ?? 0
      scores.set(id, current + 1 / (RRF_K + rank))
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}
