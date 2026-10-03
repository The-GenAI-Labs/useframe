import { z } from "zod";
import dotenv from "dotenv";
import { JevEnvSchema } from "@repo/jev/config";

dotenv.config();

const envSchema = z
  .object({
    ...JevEnvSchema.shape,
    OFF_TOPIC_THRESHOLD: z.coerce.number().min(0).max(1).default(0.65),
    MAX_HISTORY_MESSAGES: z.coerce.number().int().min(1).max(30).default(10),
    CHAT_MODEL: z.literal("deepseek-v4-flash").default("deepseek-v4-flash"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    GCS_BUCKET: z.string().min(1).optional(),
    INTERNAL_SERVICE_SECRET: z.string().min(16).optional(),
    PORT: z.string().default("4001"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    ANTHROPIC_API_KEY: z.string().default(""),
    DEEPSEEK_API_KEY: z.string().default(""),
    OPENAI_API_KEY: z.string().default(""),
    KIMI_API_KEY: z.string().default(""),

    // Optional — competitor discovery (Brave Search) becomes a graceful no-op
    // when unset, see tools/competitorSearch.ts.
    BRAVE_API_KEY: z.string().default(""),

    JWT_ACCESS_SECRET: z
      .string()
      .min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
    RESEARCH_SERVICE_URL: z.string().default("http://localhost:4004"),
    CLIENT_URL: z.string().default("http://localhost:3000"),
    REDIS_URL: z.string().default("redis://localhost:6379"),

    // Langfuse tracing — no-op until real credentials are supplied. Wiring
    // the SDK flags is Stage 3 scope; standing up self-hosted Langfuse
    // infra (Helm/k8s) is a separate decision, not made here.
    LANGFUSE_PUBLIC_KEY: z.string().default(""),
    LANGFUSE_SECRET_KEY: z.string().default(""),
    LANGFUSE_HOST: z.string().default(""),
  })
  .refine(
    (d) =>
      d.ANTHROPIC_API_KEY !== "" ||
      d.DEEPSEEK_API_KEY !== "" ||
      d.OPENAI_API_KEY !== "" ||
      d.KIMI_API_KEY !== "",
    { message: "At least one LLM provider API key must be set." },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const CONFIGURED_PROVIDERS = {
  anthropic: env.ANTHROPIC_API_KEY !== "",
  deepseek: env.DEEPSEEK_API_KEY !== "",
  openai: env.OPENAI_API_KEY !== "",
  kimi: env.KIMI_API_KEY !== "",
} as const;
