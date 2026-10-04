import os from "node:os";
import path from "node:path";
import { z } from "zod";

const int = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const hostList = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.string().default("4005"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: z.string().url("REDIS_URL must be a redis:// or rediss:// URL"),
    INTERNAL_SERVICE_SECRET: z.string().min(16, "INTERNAL_SERVICE_SECRET must be at least 16 chars"),

    SITES_BASE_DOMAIN: z
      .string()
      .min(1)
      .regex(/^[a-z0-9.-]+$/, "SITES_BASE_DOMAIN must be a lowercase hostname"),
    SITES_RESERVED_HOSTS: hostList.default("useframe.in,www.useframe.in,api.useframe.in"),

    CLOUDFLARE_ACCOUNT_ID: z.string().min(1, "CLOUDFLARE_ACCOUNT_ID is required"),
    CLOUDFLARE_API_TOKEN: z.string().min(1, "CLOUDFLARE_API_TOKEN is required"),
    CLOUDFLARE_ZONE_ID: z.string().optional(),
    SITES_KV_NAMESPACE_ID: z.string().min(1, "SITES_KV_NAMESPACE_ID is required"),

    SITES_R2_BUCKET: z.string().min(1).default("useframe-sites"),
    SITES_R2_ACCESS_KEY_ID: z.string().min(1, "SITES_R2_ACCESS_KEY_ID is required"),
    SITES_R2_SECRET_ACCESS_KEY: z.string().min(1, "SITES_R2_SECRET_ACCESS_KEY is required"),
    SITES_R2_ENDPOINT: z.string().url().optional(),

    DEPLOY_RETAIN_COUNT: int(10),
    DEPLOY_MAX_FILES: int(5000),
    DEPLOY_MAX_TOTAL_MB: int(100),
    DEPLOY_INSTALL_TIMEOUT_MS: int(300_000),
    DEPLOY_BUILD_TIMEOUT_MS: int(480_000),
    DEPLOY_BUILD_CONCURRENCY: int(2),
    DEPLOY_ACTIVATION_PROBE_MS: int(150_000),
    DEPLOY_REAPER_STUCK_MINUTES: int(30),
    DEPLOY_WORK_DIR: z.string().optional(),
    DEPLOY_BUILD_UID: int(10002),
    DEPLOY_BUILD_GID: int(10002),
    DEPLOY_BUILD_ISOLATION: z.enum(["setpriv", "none"]).default("setpriv"),
    DEPLOY_NODE_MODULES_TEMPLATES: z.string().default("/opt/templates"),
    DEPLOY_ENQUEUE_VALIDATION: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && value.DEPLOY_BUILD_ISOLATION === "none") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DEPLOY_BUILD_ISOLATION"],
        message: "DEPLOY_BUILD_ISOLATION=none is not allowed when NODE_ENV=production",
      });
    }
  })
  .transform((value) => ({
    ...value,
    SITES_R2_ENDPOINT:
      value.SITES_R2_ENDPOINT ?? `https://${value.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    DEPLOY_WORK_DIR:
      value.DEPLOY_WORK_DIR ??
      (value.NODE_ENV === "production" ? "/work" : path.join(os.tmpdir(), "useframe-deploy")),
  }));

export type Env = z.infer<typeof envSchema>;

export function parseEnv(
  source: NodeJS.ProcessEnv,
): { ok: true; env: Env } | { ok: false; errors: Record<string, string[]> } {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return { ok: true, env: parsed.data };
  return { ok: false, errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
}
