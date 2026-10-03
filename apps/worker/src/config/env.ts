import { z } from "zod";
import dotenv from "dotenv";
import { CorpusEnvSchema } from "@repo/rag/config";

dotenv.config();

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: z.string().default("redis://localhost:6379"),

    GCS_BUCKET: z.string().min(1).optional(),
    VALIDATION_PREVIEW_NAMESPACE: z.string().default("useframe-validation"),
    VALIDATION_RUNTIME_CLASS: z.string().default("gvisor"),
    VALIDATION_PREVIEW_IMAGE: z.string().default("useframe-validation:local"),
    ORCHESTRATOR_URL: z.string().url().default("http://localhost:4001"),
    SCORING_SERVICE_URL: z.string().default("http://localhost:4003"),
    INTERNAL_SERVICE_SECRET: z
      .string()
      .min(16, "INTERNAL_SERVICE_SECRET must be at least 16 chars"),

    SEO_AUDIT_MAX_PAGES: z.coerce.number().int().positive().default(8),
    SEO_AUDIT_CONCURRENCY: z.coerce.number().int().positive().default(2),
    ANTHROPIC_API_KEY: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),

    VERCEL_TOKEN: z.string().min(1, "VERCEL_TOKEN is required"),
    VERCEL_TEAM_ID: z.string().optional(),
    VERCEL_ORG_ID: z.string().optional(),
    VERCEL_PROJECT_NAME_PREFIX: z.string().default("useframe"),

    RAZORPAY_KEY_ID: z.string().min(1, "RAZORPAY_KEY_ID is required"),
    RAZORPAY_KEY_SECRET: z.string().min(1, "RAZORPAY_KEY_SECRET is required"),
  })
  .merge(CorpusEnvSchema)
  .refine(
    (v) => !v.CORPUS_PUBSUB_SUBSCRIPTION || !!v.GCS_RESEARCH_CORPUS_BUCKET,
    "GCS_RESEARCH_CORPUS_BUCKET is required for corpus subscriptions",
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
