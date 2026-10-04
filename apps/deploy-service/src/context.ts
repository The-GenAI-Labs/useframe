import { Queue } from "bullmq";
import { prisma } from "@useframe/db";
import { QUEUES, type DeployRunJobPayload } from "@repo/events";
import { env } from "@/config/env.js";
import type { Deps } from "@/deps.js";
import { CloudflareKv } from "@/lib/cloudflareKv.js";
import { createR2 } from "@/lib/r2.js";
import { redis } from "@/lib/redis.js";

export const runQueue = new Queue<DeployRunJobPayload>(QUEUES.DEPLOY_RUN, { connection: redis });

export const deps: Deps = {
  db: prisma,
  kv: new CloudflareKv({
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    namespaceId: env.SITES_KV_NAMESPACE_ID,
    apiToken: env.CLOUDFLARE_API_TOKEN,
  }),
  r2: createR2({
    endpoint: env.SITES_R2_ENDPOINT,
    accessKeyId: env.SITES_R2_ACCESS_KEY_ID,
    secretAccessKey: env.SITES_R2_SECRET_ACCESS_KEY,
    bucket: env.SITES_R2_BUCKET,
  }),
  redis,
  runQueue,
  validationQueue: env.DEPLOY_ENQUEUE_VALIDATION
    ? new Queue(QUEUES.VALIDATE_MAIN, { connection: redis })
    : undefined,
  config: {
    baseDomain: env.SITES_BASE_DOMAIN,
    workDir: env.DEPLOY_WORK_DIR,
    templatesRoot: env.DEPLOY_NODE_MODULES_TEMPLATES,
    isolation: env.DEPLOY_BUILD_ISOLATION,
    buildUid: env.DEPLOY_BUILD_UID,
    buildGid: env.DEPLOY_BUILD_GID,
    installTimeoutMs: env.DEPLOY_INSTALL_TIMEOUT_MS,
    buildTimeoutMs: env.DEPLOY_BUILD_TIMEOUT_MS,
    probeTimeoutMs: env.DEPLOY_ACTIVATION_PROBE_MS,
    probeIntervalMs: 3000,
    maxFiles: env.DEPLOY_MAX_FILES,
    maxTotalBytes: env.DEPLOY_MAX_TOTAL_MB * 1024 * 1024,
    retainCount: env.DEPLOY_RETAIN_COUNT,
    reaperStuckMinutes: env.DEPLOY_REAPER_STUCK_MINUTES,
    enqueueValidation: env.DEPLOY_ENQUEUE_VALIDATION,
  },
};

export async function closeContext(): Promise<void> {
  await runQueue.close();
  await redis.quit().catch(() => undefined);
  await prisma.$disconnect();
}
