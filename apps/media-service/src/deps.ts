import type { prisma } from "@useframe/db"
import type { MediaProcessJobPayload } from "@repo/events"
import type { MediaStore } from "@/lib/storage.js"
import type { Describer } from "@/processing/describe.js"
import type { FfmpegConfig } from "@/processing/ffmpeg.js"

export type Db = Pick<typeof prisma, "mediaAsset" | "creditBalance" | "pipelineLog" | "$transaction">

export type MediaConfig = {
  workDir: string
  maxInputPixels: number
  maxVideoSeconds: number
  maxImageBytes: number
  maxVideoBytes: number
  ffmpeg: FfmpegConfig
}

export type Deps = {
  db: Db
  store: MediaStore
  describe: Describer | null
  enqueue: (payload: MediaProcessJobPayload, jobId: string) => Promise<void>
  config: MediaConfig
}

export const PROCESS_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 1000,
} as const

export const FLAGGED_REASON = "This file can't be used"

export function mediaPrefix(projectId: string, assetId: string): string {
  return `media/${projectId}/${assetId}/`
}
