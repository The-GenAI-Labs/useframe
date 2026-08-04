import { z } from "zod"
import dotenv from "dotenv"

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("4001"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  ANTHROPIC_API_KEY: z.string().default(""),
  DEEPSEEK_API_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  KIMI_API_KEY: z.string().default(""),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  RESEARCH_SERVICE_URL: z.string().default("http://localhost:4002"),
  CLIENT_URL: z.string().default("http://localhost:3000"),
})
  .refine(
    (d) =>
      d.ANTHROPIC_API_KEY !== "" ||
      d.DEEPSEEK_API_KEY !== "" ||
      d.OPENAI_API_KEY !== "" ||
      d.KIMI_API_KEY !== "",
    { message: "At least one LLM provider API key must be set." },
  )

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment variables:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data

export const CONFIGURED_PROVIDERS = {
  anthropic: env.ANTHROPIC_API_KEY !== "",
  deepseek: env.DEEPSEEK_API_KEY !== "",
  openai: env.OPENAI_API_KEY !== "",
  kimi: env.KIMI_API_KEY !== "",
} as const
