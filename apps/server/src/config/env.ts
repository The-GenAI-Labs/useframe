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
    REDIS_URL: z.string().default("redis://localhost:6379"),
    ORCHESTRATOR_URL: z.string().default("http://localhost:4001"),
    BILLING_SERVICE_URL: z.string().default("http://localhost:4002"),
    SCORING_SERVICE_URL: z.string().default("http://localhost:4003"),
    RESEARCH_SERVICE_URL: z.string().default("http://localhost:4004"),

    VERCEL_TOKEN: z.string().default(""),
    VERCEL_TEAM_ID: z.string().default(""),

    FRONTEND_URL: z.string().default("http://localhost:3000"),

    GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
    GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
    GOOGLE_REDIRECT_URI: z.string().default("http://localhost:4000/api/auth/google/callback"),

    GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
    GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),
    GITHUB_REDIRECT_URI: z.string().default("http://localhost:4000/api/auth/github/callback"),

    RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
    EMAIL_FROM: z.string().default("noreply@useframe.so"),

    TURNSTILE_SECRET_KEY: z.string().min(1, "TURNSTILE_SECRET_KEY is required"),

    // Optional — IP reputation (VPN/datacenter/proxy) enrichment for signup
    // risk scoring. Left empty, getIpRisk() no-ops to a neutral score rather
    // than failing signup; this is a risk *signal*, never a hard gate on its
    // own.
    IPQS_API_KEY: z.string().default(""),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
    console.error("Invalid environment variables:")
    console.error(parsed.error.flatten().fieldErrors)
    process.exit(1)
}

export const env = parsed.data