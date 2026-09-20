import { z } from "zod"
import dotenv from "dotenv"

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("4004"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  COHERE_API_KEY: z.string().default(""),
  OPENAI_API_KEY: z.string().default(""),
  RESEARCH_MOCK: z
    .string()
    .default("true")
    .transform((v) => v === "true"),

  CLIENT_URL: z.string().default("http://localhost:3000"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error("Invalid environment variables:")
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
