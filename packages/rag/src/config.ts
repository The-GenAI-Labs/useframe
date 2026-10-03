import { z } from "zod";

export const RagEnvSchema = z.object({
  EMBEDDING_PROVIDER: z.literal("voyage").default("voyage"),
  VOYAGE_API_KEY: z.string().default(""),
  EMBEDDING_MODEL: z.string().min(1).default("voyage-4"),
  EMBEDDING_DIMS: z.coerce.number().int().positive().default(1024),
  COHERE_API_KEY: z.string().default(""),
  COHERE_RERANK_MODEL: z.string().min(1).default("rerank-v4.0-fast"),
  RERANK_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.15),
  PER_AREA_TOP_K: z.coerce.number().int().min(1).max(30).default(5),
  RRF_K: z.coerce.number().positive().default(60),
  DENSE_CANDIDATES: z.coerce.number().int().min(1).max(80).default(40),
  SPARSE_CANDIDATES: z.coerce.number().int().min(1).max(80).default(40),
  FUSED_CANDIDATES: z.coerce.number().int().min(1).max(80).default(30),
  LANGFUSE_PUBLIC_KEY: z.string().default(""),
  LANGFUSE_SECRET_KEY: z.string().default(""),
  LANGFUSE_HOST: z.union([z.string().url(), z.literal("")]).default(""),
});
export type RagConfig = z.infer<typeof RagEnvSchema>;
export const CorpusEnvSchema = RagEnvSchema.extend({
  GCP_PROJECT_ID: z.string().optional(),
  GCS_RESEARCH_CORPUS_BUCKET: z.string().min(1).optional(),
  CORPUS_PUBSUB_TOPIC: z.string().optional(),
  CORPUS_PUBSUB_SUBSCRIPTION: z.string().min(1).optional(),
});
export function ragConfig(): RagConfig {
  return RagEnvSchema.parse(process.env);
}
