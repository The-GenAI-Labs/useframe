import { prisma } from "@useframe/db";
import { z } from "zod";
import { type RagConfig } from "./config.js";
import { requestJson, ProviderError } from "./http.js";
export type RankedFinding = { id: string; score: number };
export function buildTsQuery(keywords: string[]): string {
  return [
    ...new Set(
      keywords
        .map((k) =>
          k
            .toLowerCase()
            .replace(/[^a-z0-9 ]/g, " ")
            .trim()
            .split(/\s+/)
            .filter(Boolean),
        )
        .filter((k) => k.length)
        .map((k) => (k.length > 1 ? `(${k.join(" & ")})` : k[0]!)),
    ),
  ].join(" | ");
}
export function fuseRanks(lists: RankedFinding[][], k = 60): RankedFinding[] {
  const scores = new Map<string, number>();
  for (const list of lists)
    for (const [rank, item] of [
      ...new Map(list.map((v) => [v.id, v])).values(),
    ].entries())
      scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank + 1));
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
export async function denseSearch(
  vector: number[],
  model: string,
  limit: number,
): Promise<RankedFinding[]> {
  const literal = `[${vector.join(",")}]`;
  if (!vector.length || vector.some((v) => !Number.isFinite(v)))
    throw new Error("Invalid query vector");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL hnsw.ef_search = 100`;
    return tx.$queryRaw<
      RankedFinding[]
    >`SELECT c."findingId" AS id, MAX(1 - (c.embedding <=> ${literal}::vector)) AS score
      FROM (SELECT fc."findingId", fc.embedding FROM finding_chunks fc JOIN research_findings f ON f.id = fc."findingId"
      WHERE f.status = 'VERIFIED' AND fc."embeddingModel" = ${model}
      ORDER BY fc.embedding <=> ${literal}::vector LIMIT 80) c GROUP BY c."findingId" ORDER BY score DESC, id LIMIT ${limit}`;
  });
}
export async function sparseSearch(
  query: string,
  limit: number,
): Promise<RankedFinding[]> {
  if (!query) return [];
  return prisma.$queryRaw<
    RankedFinding[]
  >`SELECT id, ts_rank_cd("searchVector", q)::float8 AS score FROM research_findings, to_tsquery('english', ${query}) q WHERE status = 'VERIFIED' AND "searchVector" @@ q ORDER BY score DESC, id LIMIT ${limit}`;
}
export async function cohereRerank(
  query: string,
  documents: string[],
  config: RagConfig,
) {
  if (!documents.length) return [];
  if (!config.COHERE_API_KEY)
    throw new ProviderError("COHERE_API_KEY is not configured", false);
  const result = z
    .object({
      results: z.array(
        z.object({
          index: z
            .number()
            .int()
            .min(0)
            .max(documents.length - 1),
          relevance_score: z.number().finite().min(0).max(1),
        }),
      ),
    })
    .parse(
      await requestJson(
        "https://api.cohere.com/v2/rerank",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.COHERE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: config.COHERE_RERANK_MODEL,
            query,
            documents,
            top_n: config.PER_AREA_TOP_K,
          }),
        },
        2,
      ),
    );
  return result.results;
}
