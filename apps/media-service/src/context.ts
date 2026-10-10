import { Queue } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES, type MediaProcessJobPayload } from "@repo/events"
import { env } from "@/config/env.js"
import { PROCESS_JOB_OPTIONS, type Deps } from "@/deps.js"
import { redis } from "@/lib/redis.js"
import { createS3MediaStore } from "@/lib/storage.js"
import { createOrchestratorDescriber } from "@/processing/describe.js"

export const processQueue = new Queue<MediaProcessJobPayload>(QUEUES.MEDIA_PROCESS, { connection: redis })

export const deps: Deps = {
  db: prisma,
  store: createS3MediaStore({
    endpoint: env.MEDIA_R2_ENDPOINT,
    accessKeyId: env.MEDIA_R2_ACCESS_KEY_ID,
    secretAccessKey: env.MEDIA_R2_SECRET_ACCESS_KEY,
    bucket: env.MEDIA_R2_BUCKET,
  }),
  describe:
    env.MEDIA_DESCRIBE_ENABLED && env.INTERNAL_SERVICE_SECRET
      ? createOrchestratorDescriber({
          url: env.ORCHESTRATOR_URL,
          secret: env.INTERNAL_SERVICE_SECRET,
          timeoutMs: env.MEDIA_DESCRIBE_TIMEOUT_MS,
        })
      : null,
  enqueue: async (payload, jobId) => {
    await processQueue.add("process", payload, { jobId, ...PROCESS_JOB_OPTIONS })
  },
  config: {
    workDir: env.MEDIA_WORK_DIR,
    maxInputPixels: env.MEDIA_MAX_INPUT_PIXELS,
    maxVideoSeconds: env.MEDIA_MAX_VIDEO_SECONDS,
    maxImageBytes: env.MEDIA_PAID_MAX_IMAGE_BYTES,
    maxVideoBytes: env.MEDIA_PAID_MAX_VIDEO_BYTES,
    ffmpeg: {
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      timeoutMs: env.MEDIA_FFMPEG_TIMEOUT_MS,
      threads: env.MEDIA_FFMPEG_THREADS,
    },
  },
}

export async function closeContext(): Promise<void> {
  await processQueue.close()
  await redis.quit().catch(() => undefined)
  await prisma.$disconnect()
}
