import { CohereClientV2 } from "cohere-ai"
import { env } from "@/config/env.js"

let client: CohereClientV2 | null = null

function getClient(): CohereClientV2 {
  if (!client) client = new CohereClientV2({ token: env.COHERE_API_KEY })
  return client
}

export type RerankCandidate = { id: string; text: string }
export type RerankedId = { id: string; score: number | null }

// Falls back to the incoming (fused) order with null scores when Cohere is
// unconfigured or errors, so retrieval degrades instead of failing outright.
export async function rerank(
  query: string,
  candidates: RerankCandidate[],
  topN: number,
): Promise<RerankedId[]> {
  if (candidates.length === 0) return []
  const fallback = () => candidates.slice(0, topN).map((c) => ({ id: c.id, score: null }))
  if (!env.COHERE_API_KEY) return fallback()

  try {
    const response = await getClient().rerank({
      model: "rerank-v3.5",
      query,
      documents: candidates.map((c) => c.text),
      topN: Math.min(topN, candidates.length),
    })
    return response.results.map((r) => ({ id: candidates[r.index]!.id, score: r.relevanceScore }))
  } catch (err) {
    console.warn("[rerank] falling back to fused order:", err instanceof Error ? err.message : err)
    return fallback()
  }
}
