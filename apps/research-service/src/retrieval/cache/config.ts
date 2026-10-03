import { z } from "zod";
export const CacheEnvSchema = z.object({
  CACHE_SIM_HIGH: z.coerce.number().min(0).max(1).default(0.97),
  CACHE_SIM_LOW: z.coerce.number().min(0).max(1).default(0.88),
  CACHE_SEMANTIC_CANDIDATES: z.coerce.number().int().min(1).max(20).default(3),
  CACHE_DEDUP_SIM: z.coerce.number().min(0).max(1).default(0.99),
  CACHE_EXACT_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(2592000)
    .default(2592000),
  JEV_CACHE_ACCEPT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  JEV_MODE_RETRIEVAL_CACHE_VERIFY: z
    .enum(["off", "shadow", "on"])
    .default("off"),
});
export type CacheConfig = z.infer<typeof CacheEnvSchema>;
export function cacheConfig(input: unknown = process.env): CacheConfig {
  const config = CacheEnvSchema.parse(input);
  if (
    config.CACHE_SIM_LOW > config.CACHE_SIM_HIGH ||
    config.CACHE_SIM_HIGH > config.CACHE_DEDUP_SIM
  )
    throw new Error("Cache thresholds must satisfy LOW <= HIGH <= DEDUP");
  return config;
}
