import { z } from "zod";
import { prisma } from "@useframe/db";
import { ragConfig, type RagConfig } from "./config.js";
import { ProviderError, requestJson } from "./http.js";

export interface EmbeddingProvider {
  model: string;
  dims: number;
  embedDocuments(texts: string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
  embedQueries(texts: string[]): Promise<number[][]>;
}
export function voyageProvider(
  config: RagConfig = ragConfig(),
): EmbeddingProvider {
  const { EMBEDDING_MODEL: model, EMBEDDING_DIMS: dims } = config;
  async function embed(texts: string[], input_type: "document" | "query") {
    if (!config.VOYAGE_API_KEY)
      throw new ProviderError("VOYAGE_API_KEY is required", false);
    const vectors: number[][] = [];
    // Voyage allows 1000 inputs and 120K tokens (voyage-4-large) per request; UTF-8 bytes bound tokens from above.
    for (let offset = 0; offset < texts.length; ) {
      const batch: string[] = [];
      let bytes = 0;
      while (offset < texts.length && batch.length < 1000) {
        const text = texts[offset]!;
        const size = Buffer.byteLength(text);
        if (size > 30000)
          throw new ProviderError(
            "Embedding input exceeds the conservative token budget",
            false,
          );
        if (batch.length && bytes + size > 120000) break;
        batch.push(text);
        bytes += size;
        offset++;
      }
      const response = z
        .object({
          data: z
            .array(
              z.object({
                index: z.number().int().nonnegative(),
                embedding: z.array(z.number().finite()).length(dims),
              }),
            )
            .length(batch.length),
        })
        .parse(
          await requestJson("https://api.voyageai.com/v1/embeddings", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.VOYAGE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              input: batch,
              input_type,
              output_dimension: dims,
              truncation: false,
            }),
          }),
        );
      const sorted = response.data.sort((a, b) => a.index - b.index);
      if (sorted.some((row, index) => row.index !== index))
        throw new ProviderError("Invalid embedding response indices", false);
      vectors.push(...sorted.map((row) => row.embedding));
    }
    return vectors;
  }
  return {
    model,
    dims,
    embedDocuments: (texts) => embed(texts, "document"),
    embedQuery: async (text) => (await embed([text], "query"))[0]!,
    embedQueries: (texts) => embed(texts, "query"),
  };
}
// Serves vectors embedded ahead of time in one batch and falls back to the provider for anything else.
export function prefetchedEmbedder(
  base: EmbeddingProvider,
  vectors: Map<string, number[]>,
): EmbeddingProvider {
  return {
    ...base,
    embedDocuments: async (texts) =>
      texts.every((t) => vectors.has(t))
        ? texts.map((t) => vectors.get(t)!)
        : base.embedDocuments(texts),
  };
}
export async function assertEmbeddingDimensions(dims: number): Promise<void> {
  const rows = await prisma.$queryRaw<
    Array<{ type: string }>
  >`SELECT format_type(a.atttypid, a.atttypmod) AS type FROM pg_attribute a WHERE a.attrelid = to_regclass('finding_chunks') AND a.attname = 'embedding' AND NOT a.attisdropped`;
  if (rows[0]?.type !== `vector(${dims})`)
    throw new Error(
      `EMBEDDING_DIMS=${dims} does not match finding_chunks.embedding (${rows[0]?.type ?? "missing migration"})`,
    );
}
