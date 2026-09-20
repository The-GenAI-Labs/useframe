import { embed } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { prisma } from "@useframe/db"
import { env } from "@/config/env.js"
import type { RankedId } from "./fuse.js"

const openaiProvider = createOpenAI({ apiKey: env.OPENAI_API_KEY })
const embeddingModel = openaiProvider.textEmbeddingModel("text-embedding-3-small")

export async function embedQuery(query: string): Promise<number[]> {
  const { embedding } = await embed({ model: embeddingModel, value: query })
  return embedding
}

export async function denseRank(
  query: string,
  candidateIds: string[],
): Promise<RankedId[]> {
  if (candidateIds.length === 0) return []

  const queryEmbedding = await embedQuery(query)
  const vectorLiteral = `[${queryEmbedding.join(",")}]`

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM research_findings
     WHERE id = ANY($1::text[]) AND embedding IS NOT NULL
     ORDER BY embedding <=> $2::vector
     LIMIT $3`,
    candidateIds,
    vectorLiteral,
    candidateIds.length,
  )

  return rows.map((row: { id: string }, rank: number) => ({ id: row.id, rank }))
}
