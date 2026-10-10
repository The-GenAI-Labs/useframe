import { Queue } from "bullmq";
import { prisma } from "@useframe/db";
import { QUEUES, type DeployRunJobPayload, type DomainTickJobPayload } from "@repo/events";
import { env } from "@/config/env.js";
import type { Deps } from "@/deps.js";
import { CloudflareKv } from "@/lib/cloudflareKv.js";
import { createR2 } from "@/lib/r2.js";
import { redis } from "@/lib/redis.js";
import { CloudflareCustomHostnameProvider } from "@/domains/cloudflareProvider.js";
import type { DomainDeps } from "@/domains/deps.js";
import { createExplicitResolver } from "@/domains/dns.js";
import { fetchProber } from "@/domains/prober.js";
import { createRedisScratch, createTickScheduler } from "@/domains/runtime.js";
import { log } from "@/lib/logger.js";
import { createDeployment } from "@/services/deployments.js";
import { HttpError } from "@/services/httpError.js";
import { syncSiteToKvs } from "@/site/sync.js";

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
  mediaSource:
    env.MEDIA_R2_READ_ACCESS_KEY_ID && env.MEDIA_R2_READ_SECRET_ACCESS_KEY
      ? createR2({
          endpoint: env.MEDIA_R2_ENDPOINT,
          accessKeyId: env.MEDIA_R2_READ_ACCESS_KEY_ID,
          secretAccessKey: env.MEDIA_R2_READ_SECRET_ACCESS_KEY,
          bucket: env.MEDIA_R2_BUCKET,
        })
      : null,
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

function domainsDisabledReason(): string | null {
  if (!env.CUSTOM_DOMAINS_ENABLED) return "CUSTOM_DOMAINS_ENABLED is not true";
  if (!env.CLOUDFLARE_ZONE_ID) return "CLOUDFLARE_ZONE_ID is not set";
  return null;
}

export const domainTickQueue = new Queue<DomainTickJobPayload>(QUEUES.DEPLOY_DOMAIN_RECONCILE, {
  connection: redis,
});
export const domainTicks = createTickScheduler(domainTickQueue, redis);

export const domainProvider = env.CLOUDFLARE_ZONE_ID
  ? new CloudflareCustomHostnameProvider({ zoneId: env.CLOUDFLARE_ZONE_ID, apiToken: env.CLOUDFLARE_API_TOKEN })
  : null;

const disabledReason = domainsDisabledReason();
if (disabledReason) log.info(`Custom domains disabled: ${disabledReason}`);

export const domainDeps: DomainDeps | null =
  disabledReason || !domainProvider
    ? null
    : {
        db: prisma,
        provider: domainProvider,
        dns: createExplicitResolver(env.DNS_RESOLVERS),
        prober: fetchProber,
        scratch: createRedisScratch(redis),
        config: {
          baseDomain: env.SITES_BASE_DOMAIN,
          reservedHosts: env.SITES_RESERVED_HOSTS,
          blocklist: env.CUSTOM_DOMAIN_BLOCKLIST,
          edgeTarget: env.SITES_EDGE_CNAME_TARGET,
          capacityLimit: env.CUSTOM_DOMAIN_CAPACITY_LIMIT,
          ownershipWindowMs: env.CUSTOM_DOMAIN_OWNERSHIP_WINDOW_HOURS * 60 * 60 * 1000,
          routingWindowMs: env.CUSTOM_DOMAIN_ROUTING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        },
        syncSite: (siteId, options) => syncSiteToKvs(deps, siteId, options),
        readKv: (key) => deps.kv.get(key),
        async requestRedeploy(input) {
          try {
            await createDeployment(deps, { ...input, triggeredBy: "domain_change" });
            return "queued";
          } catch (err) {
            if (err instanceof HttpError && err.status === 409) return "busy";
            if (err instanceof HttpError && (err.status === 403 || err.status === 404)) return "skipped";
            throw err;
          }
        },
        schedule: (domainId, delayMs) => domainTicks.schedule(domainId, delayMs),
        alert: (message, fields) => log.error(`ALERT: ${message}`, fields),
        now: () => new Date(),
      };

deps.domains = domainDeps;

export async function closeContext(): Promise<void> {
  await runQueue.close();
  await domainTickQueue.close();
  await redis.quit().catch(() => undefined);
  await prisma.$disconnect();
}
