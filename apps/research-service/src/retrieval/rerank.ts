import { CohereClientV2 } from "cohere-ai"
import { env } from "@/config/env.js"

let client: CohereClientV2 | null = null

function getClient(): CohereClientV2 {
  if (!client) client = new CohereClientV2({ token: env.COHERE_API_KEY })
  return client
}

export type RerankCandidate = { id: string; text: string }

export async function rerank(
  query: string,
  candidates: RerankCandidate[],
  topN: number,
): Promise<string[]> {
  if (candidates.length === 0) return []

  const response = await getClient().rerank({
    model: "rerank-v3.5",
    query,
    documents: candidates.map((c) => c.text),
    topN: Math.min(topN, candidates.length),
  })

  return response.results.map((r) => candidates[r.index]!.id)
}
