import { Queue, Worker } from "bullmq";
import { prisma } from "@useframe/db";
import { QUEUES, type DeployKvsReconcileJobPayload, type DeployRunJobPayload } from "@repo/events";
import { env } from "@/config/env.js";
import { closeContext, deps } from "@/context.js";
import { runGc } from "@/jobs/gc.js";
import { reapStuckDeployments } from "@/jobs/reaper.js";
import { reconcile } from "@/jobs/reconcile.js";
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
  return [gc, reaper, reconcileQueue];
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
  ];
  for (const worker of workers) {
    worker.on("failed", (job, err) =>
      log.error("job failed", { queue: worker.name, jobId: job?.id, error: errorMessage(err) }),
    );
  }
  log.info("deploy worker started", {
    concurrency: env.DEPLOY_BUILD_CONCURRENCY,
    isolation: env.DEPLOY_BUILD_ISOLATION,
    workDir: env.DEPLOY_WORK_DIR,
  });

  // SIGTERM: stop taking jobs and let in-flight builds finish (k8s grace period covers it).
  const shutdown = () => {
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
