import { Queue, Worker } from "bullmq";
import { prisma } from "@useframe/db";
import {
  QUEUES,
  type DeployKvsReconcileJobPayload,
  type DeployRunJobPayload,
  type DomainTickJobPayload,
} from "@repo/events";
import { env } from "@/config/env.js";
import { closeContext, deps, domainDeps, domainTicks } from "@/context.js";
import { tick } from "@/domains/machine.js";
import { ERROR_BACKOFF_MS } from "@/domains/schedule.js";
import { runDomainGc, runDomainHealthcheck } from "@/domains/service.js";
import { withLock } from "@/lib/locks.js";
import { runGc } from "@/jobs/gc.js";
import { reapStuckDeployments } from "@/jobs/reaper.js";
import { reconcile } from "@/jobs/reconcile.js";
import { startHealthServer } from "@/lib/health.js";
import { errorMessage, log } from "@/lib/logger.js";
import { redis } from "@/lib/redis.js";
import { runDeployment } from "@/pipeline/runDeployment.js";

async function schedule(): Promise<Queue[]> {
  const gc = new Queue(QUEUES.DEPLOY_GC, { connection: redis });
  const reaper = new Queue(QUEUES.DEPLOY_REAPER, { connection: redis });
  const reconcileQueue = new Queue<DeployKvsReconcileJobPayload>(QUEUES.DEPLOY_KVS_RECONCILE, {
    connection: redis,
  });
  await gc.upsertJobScheduler("deploy-gc-daily", { pattern: "0 3 * * *" }, { name: "gc" });
  await reaper.upsertJobScheduler("deploy-reaper", { every: 5 * 60_000 }, { name: "reap" });
  await reconcileQueue.upsertJobScheduler(
    "deploy-kvs-reconcile-daily",
    { pattern: "30 3 * * *" },
    { name: "reconcile", data: { apply: true } },
  );
  if (!domainDeps) return [gc, reaper, reconcileQueue];
  const domainHealth = new Queue(QUEUES.DEPLOY_DOMAIN_HEALTHCHECK, { connection: redis });
  const domainGc = new Queue(QUEUES.DEPLOY_DOMAIN_GC, { connection: redis });
  await domainHealth.upsertJobScheduler("deploy-domain-healthcheck", { pattern: "0 4 * * *" }, { name: "health" });
  await domainGc.upsertJobScheduler("deploy-domain-gc", { pattern: "0 5 * * 0" }, { name: "gc" });
  return [gc, reaper, reconcileQueue, domainHealth, domainGc];
}

function domainWorkers(): Worker[] {
  const domains = domainDeps;
  if (!domains) return [];
  return [
    new Worker<DomainTickJobPayload>(
      QUEUES.DEPLOY_DOMAIN_RECONCILE,
      async (job) => {
        const { domainId } = job.data;
        if (!(await domainTicks.isCurrent(domainId, job.id))) return;
        let next: number | null;
        try {
          next = await withLock(redis, `deploy:domain:${domainId}`, 120_000, 5_000, () => tick(domains, domainId));
        } catch (err) {
          log.warn("domain tick failed; retrying", { domainId, error: errorMessage(err) });
          next = ERROR_BACKOFF_MS;
        }
        if (next !== null) await domainTicks.schedule(domainId, next);
      },
      { connection: redis, concurrency: 10 },
    ),
    new Worker(QUEUES.DEPLOY_DOMAIN_HEALTHCHECK, () => runDomainHealthcheck(domains), { connection: redis }),
    new Worker(QUEUES.DEPLOY_DOMAIN_GC, () => runDomainGc(domains), { connection: redis }),
  ];
}

const start = async () => {
  await prisma.$connect();
  const queues = await schedule();

  const workers = [
    new Worker<DeployRunJobPayload>(QUEUES.DEPLOY_RUN, (job) => runDeployment(deps, job.data), {
      connection: redis,
      concurrency: env.DEPLOY_BUILD_CONCURRENCY,
      // A build can legitimately hold the event loop busy while copying templates.
      lockDuration: 120_000,
    }),
    new Worker(QUEUES.DEPLOY_GC, () => runGc(deps, { dryRun: false }), { connection: redis }),
    new Worker(QUEUES.DEPLOY_REAPER, () => reapStuckDeployments(deps), { connection: redis }),
    new Worker<DeployKvsReconcileJobPayload>(
      QUEUES.DEPLOY_KVS_RECONCILE,
      (job) => reconcile(deps, { apply: job.data.apply, scheduled: true }),
      { connection: redis },
    ),
    ...domainWorkers(),
  ];
  for (const worker of workers) {
    worker.on("failed", (job, err) =>
      log.error("job failed", { queue: worker.name, jobId: job?.id, error: errorMessage(err) }),
    );
  }
  let shuttingDown = false;
  if (env.HEALTH_PORT) {
    // Draining after SIGTERM is expected, so it must not fail liveness and cut builds short.
    startHealthServer(
      env.HEALTH_PORT,
      () => redis.status === "ready" && (shuttingDown || workers.every((w) => w.isRunning())),
    );
  }
  log.info("deploy worker started", {
    concurrency: env.DEPLOY_BUILD_CONCURRENCY,
    isolation: env.DEPLOY_BUILD_ISOLATION,
    workDir: env.DEPLOY_WORK_DIR,
    customDomains: !!domainDeps,
  });

  // SIGTERM: stop taking jobs and let in-flight builds finish (k8s grace period covers it).
  const shutdown = () => {
    shuttingDown = true;
    log.info("deploy worker shutting down; waiting for in-flight jobs");
    void Promise.all(workers.map((w) => w.close()))
      .then(() => Promise.all(queues.map((q) => q.close())))
      .finally(() => closeContext().finally(() => process.exit(0)));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
};

start().catch((err) => {
  console.error("Failed to start deploy worker:", err);
  process.exit(1);
});
