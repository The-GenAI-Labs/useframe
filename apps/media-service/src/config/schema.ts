import os from "node:os"
import path from "node:path"
import { z } from "zod"

const int = (fallback: number) => z.coerce.number().int().positive().default(fallback)

// dotenv turns `NAME=` into "", which must mean "not set" for optional values.
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional())

const bool = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true")

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    HEALTH_PORT: optional(z.coerce.number().int().min(1).max(65535)),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: z.string().url("REDIS_URL must be a redis:// or rediss:// URL"),

    CLOUDFLARE_ACCOUNT_ID: optional(z.string()),
    MEDIA_R2_BUCKET: z.string().min(1).default("useframe-media"),
    MEDIA_R2_ACCESS_KEY_ID: z.string().min(1, "MEDIA_R2_ACCESS_KEY_ID is required"),
    MEDIA_R2_SECRET_ACCESS_KEY: z.string().min(1, "MEDIA_R2_SECRET_ACCESS_KEY is required"),
    MEDIA_R2_ENDPOINT: optional(z.string().url()),

    MEDIA_WORK_DIR: optional(z.string()),
    MEDIA_PROCESS_CONCURRENCY: int(2),
    MEDIA_FFMPEG_TIMEOUT_MS: int(180_000),
    MEDIA_FFMPEG_THREADS: int(2),
    MEDIA_MAX_INPUT_PIXELS: int(60_000_000),
    MEDIA_MAX_VIDEO_SECONDS: int(60),
    // Hard ceilings for any original, uploaded or generated (tier limits are the API's job).
    MEDIA_PAID_MAX_IMAGE_BYTES: int(20_971_520),
    MEDIA_PAID_MAX_VIDEO_BYTES: int(157_286_400),

    MEDIA_DESCRIBE_ENABLED: bool("true"),
    ORCHESTRATOR_URL: z.string().url().default("http://localhost:4001"),
    INTERNAL_SERVICE_SECRET: optional(z.string().min(16, "INTERNAL_SERVICE_SECRET must be at least 16 chars")),
    MEDIA_DESCRIBE_TIMEOUT_MS: int(30_000),
  })
  .superRefine((value, ctx) => {
    if (!value.MEDIA_R2_ENDPOINT && !value.CLOUDFLARE_ACCOUNT_ID) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["MEDIA_R2_ENDPOINT"],
        message: "Set MEDIA_R2_ENDPOINT or CLOUDFLARE_ACCOUNT_ID",
      })
    }
    if (value.MEDIA_DESCRIBE_ENABLED && !value.INTERNAL_SERVICE_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["INTERNAL_SERVICE_SECRET"],
        message: "INTERNAL_SERVICE_SECRET is required while MEDIA_DESCRIBE_ENABLED=true",
      })
    }
  })
  .transform((value) => ({
    ...value,
    MEDIA_R2_ENDPOINT: value.MEDIA_R2_ENDPOINT ?? `https://${value.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    MEDIA_WORK_DIR:
      value.MEDIA_WORK_DIR ?? (value.NODE_ENV === "production" ? "/work" : path.join(os.tmpdir(), "useframe-media")),
  }))

export type Env = z.infer<typeof envSchema>

export function parseEnv(
  source: NodeJS.ProcessEnv,
): { ok: true; env: Env } | { ok: false; errors: Record<string, string[]> } {
  const parsed = envSchema.safeParse(source)
  if (parsed.success) return { ok: true, env: parsed.data }
  return { ok: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> }
}
