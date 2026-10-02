import okapibm25 from "okapibm25"
import type { RankedId } from "./fuse.js"

type BM25Fn = (documents: string[], keywords: string[]) => number[]

// okapibm25 is CommonJS with `exports.default = fn`: under Node's ESM loader
// the default import is the whole module object, not the function.
const okapiModule = okapibm25 as unknown as BM25Fn | { default: BM25Fn }
const BM25: BM25Fn = typeof okapiModule === "function" ? okapiModule : okapiModule.default

export type SparseCandidate = { id: string; claim: string; paper: string }

export function sparseRank(query: string, candidates: SparseCandidate[]): RankedId[] {
  if (candidates.length === 0) return []

  const documents = candidates.map((c) => `${c.claim} ${c.paper}`)
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean)

  const scores = BM25(documents, queryTerms) as number[]

  return candidates
    .map((c, i) => ({ id: c.id, score: scores[i] ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .map((entry, rank) => ({ id: entry.id, rank }))
}
