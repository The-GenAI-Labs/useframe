import { mkdir } from "node:fs/promises"
import { Queue, Worker } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES, type MediaGenerateJobPayload, type MediaProcessJobPayload } from "@repo/events"
import { env } from "@/config/env.js"
import { closeContext, deps } from "@/context.js"
import { generateDeps } from "@/generate/context.js"
import { runMediaJob } from "@/generate/runner.js"
import { sweepMediaJobs } from "@/generate/sweep.js"
import { runMediaGc } from "@/jobs/gc.js"
import { withJobLock } from "@/lib/semaphore.js"
import { processAsset } from "@/jobs/process.js"
import { startHealthServer } from "@/lib/health.js"
import { errorMessage, log } from "@/lib/logger.js"
import { redis } from "@/lib/redis.js"

const start = async () => {
  await prisma.$connect()
  await mkdir(env.MEDIA_WORK_DIR, { recursive: true, mode: 0o700 })

  const gcQueue = new Queue(QUEUES.MEDIA_GC, { connection: redis })
  await gcQueue.upsertJobScheduler("media-gc-daily", { pattern: "15 4 * * *" }, { name: "gc" })
  const sweepQueue = new Queue(QUEUES.MEDIA_JOBS_SWEEP, { connection: redis })
  await sweepQueue.upsertJobScheduler("media-jobs-sweep", { every: 5 * 60_000 }, { name: "sweep" })

  const workers = [
    new Worker<MediaProcessJobPayload>(
      QUEUES.MEDIA_PROCESS,
      (job) => processAsset(deps, job.data, { attemptsMade: job.attemptsMade, attempts: job.opts.attempts ?? 1 }),
      {
        connection: redis,
        concurrency: env.MEDIA_PROCESS_CONCURRENCY,
        // A transcode keeps a child process busy for minutes; the lock must outlast it.
        lockDuration: env.MEDIA_FFMPEG_TIMEOUT_MS + 60_000,
      },
    ),
    new Worker(QUEUES.MEDIA_GC, () => runMediaGc(deps), { connection: redis }),
    new Worker<MediaGenerateJobPayload>(
      QUEUES.MEDIA_GENERATE,
      (job) => withJobLock(redis, job.data.jobId, () => runMediaJob(generateDeps, job.data.jobId)),
      // Video renders are polled inside the job for up to MEDIA_VIDEO_TIMEOUT_S; BullMQ renews the lock meanwhile.
      { connection: redis, concurrency: 4, lockDuration: 120_000 },
    ),
    new Worker(QUEUES.MEDIA_JOBS_SWEEP, () => sweepMediaJobs(generateDeps.db), { connection: redis }),
  ]
  for (const worker of workers) {
    worker.on("failed", (job, err) =>
      log.error("job failed", { queue: worker.name, jobId: job?.id, error: errorMessage(err) }),
    )
  }

  let shuttingDown = false
  if (env.HEALTH_PORT) {
    // Draining after SIGTERM is expected, so it must not fail liveness.
    startHealthServer(
      env.HEALTH_PORT,
      () => redis.status === "ready" && (shuttingDown || workers.every((w) => w.isRunning())),
    )
  }
  log.info("media worker started", {
    concurrency: env.MEDIA_PROCESS_CONCURRENCY,
    describe: !!deps.describe,
    workDir: env.MEDIA_WORK_DIR,
  })

  const shutdown = () => {
    shuttingDown = true
    log.info("media worker shutting down; waiting for in-flight jobs")
    void Promise.all(workers.map((w) => w.close()))
      .then(() => Promise.all([gcQueue.close(), sweepQueue.close()]))
      .finally(() => closeContext().finally(() => process.exit(0)))
  }
  process.once("SIGTERM", shutdown)
  process.once("SIGINT", shutdown)
}

start().catch((err) => {
  console.error("Failed to start media worker:", err)
  process.exit(1)
})
