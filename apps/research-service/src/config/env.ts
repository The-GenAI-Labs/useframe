import { z } from "zod";
import dotenv from "dotenv";
import { JevEnvSchema } from "@repo/jev/config";
import { CacheEnvSchema } from "../retrieval/cache/config.js";
import { RagEnvSchema } from "@repo/rag/config";

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.string().default("4004"),
    INTERNAL_SERVICE_SECRET: z.string().min(16).optional(),
    ORCHESTRATOR_URL: z.string().url().default("http://localhost:4001"),
    REDIS_URL: z.string().url().optional(),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    COHERE_API_KEY: z.string().default(""),
    OPENAI_API_KEY: z.string().default(""),
    RESEARCH_MOCK: z
      .string()
      .default("true")
      .transform((v) => v === "true"),

    CLIENT_URL: z.string().default("http://localhost:3000"),
  })
  .merge(RagEnvSchema)
  .merge(CacheEnvSchema)
  .merge(JevEnvSchema);

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
