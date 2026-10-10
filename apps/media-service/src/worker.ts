import { mkdir } from "node:fs/promises"
import { Queue, Worker } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES, type MediaProcessJobPayload } from "@repo/events"
import { env } from "@/config/env.js"
import { closeContext, deps } from "@/context.js"
import { runMediaGc } from "@/jobs/gc.js"
import { processAsset } from "@/jobs/process.js"
import { startHealthServer } from "@/lib/health.js"
import { errorMessage, log } from "@/lib/logger.js"
import { redis } from "@/lib/redis.js"

const start = async () => {
  await prisma.$connect()
  await mkdir(env.MEDIA_WORK_DIR, { recursive: true, mode: 0o700 })

  const gcQueue = new Queue(QUEUES.MEDIA_GC, { connection: redis })
  await gcQueue.upsertJobScheduler("media-gc-daily", { pattern: "15 4 * * *" }, { name: "gc" })

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
      .then(() => gcQueue.close())
      .finally(() => closeContext().finally(() => process.exit(0)))
  }
  process.once("SIGTERM", shutdown)
  process.once("SIGINT", shutdown)
}

start().catch((err) => {
  console.error("Failed to start media worker:", err)
  process.exit(1)
})
