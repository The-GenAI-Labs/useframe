import { z } from "zod"
import dotenv from "dotenv"

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  R2_BUCKET: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),

  SCORING_SERVICE_URL: z.string().default("http://localhost:4003"),
  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(16, "INTERNAL_SERVICE_SECRET must be at least 16 chars"),

  SEO_AUDIT_MAX_PAGES: z.coerce.number().int().positive().default(8),
  SEO_AUDIT_CONCURRENCY: z.coerce.number().int().positive().default(2),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  VERCEL_TOKEN: z.string().min(1, "VERCEL_TOKEN is required"),
  VERCEL_TEAM_ID: z.string().optional(),
  VERCEL_ORG_ID: z.string().optional(),
  VERCEL_PROJECT_NAME_PREFIX: z.string().default("useframe"),

  RAZORPAY_KEY_ID: z.string().min(1, "RAZORPAY_KEY_ID is required"),
  RAZORPAY_KEY_SECRET: z.string().min(1, "RAZORPAY_KEY_SECRET is required"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment variables:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
