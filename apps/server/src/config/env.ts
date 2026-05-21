import { z } from "zod"
import dotenv from "dotenv"

dotenv.config()

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.string().default("4000"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
    JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
    JWT_ACCESS_EXPIRY: z.string().default("15m"),
    JWT_REFRESH_EXPIRY: z.string().default("7d"),
    CLIENT_URL: z.string().default("http://localhost:3000"),
    BCRYPT_ROUNDS: z.string().default("12"),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("Invalid environment variables:")
    console.error(parsed.error.flatten().fieldErrors)
    process.exit(1)
}

export const env = parsed.data