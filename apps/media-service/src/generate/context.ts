import { randomUUID } from "node:crypto"
import { readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { prisma } from "@useframe/db"
import {
  FakeImageProvider,
  FakeLlm,
  FakeVideoProvider,
  loadMediaAiConfig,
  OpenAiImageProvider,
  RunwareVideoProvider,
} from "@repo/media-ai"
import { env } from "@/config/env.js"
import { deps as processDeps } from "@/context.js"
import { createAssetFromBytes, finishReservedAsset, reserveGeneratedAsset } from "@/createAsset.js"
import { createOrchestratorLlm } from "@/lib/llmClient.js"
import { redis } from "@/lib/redis.js"
import { safeDownload } from "@/lib/safeDownload.js"
import { localSemaphore, redisSemaphore } from "@/lib/semaphore.js"
import { createS3MediaStore } from "@/lib/storage.js"
import { runTool } from "@/processing/ffmpeg.js"
import type { GenerateDeps } from "./deps.js"

const live = env.MEDIA_AI_PROVIDER_MODE === "live"
const ffmpeg = processDeps.config.ffmpeg

async function scratch<T>(fn: (dir: (name: string) => string) => Promise<T>): Promise<T> {
  const id = randomUUID()
  const file = (name: string) => path.join(env.MEDIA_WORK_DIR, `${id}-${name}`)
  try {
    return await fn(file)
  } finally {
    await Promise.all(["in.mp4", "out.png", "fake.mp4"].map((n) => rm(file(n), { force: true })))
  }
}

async function extractFrame(video: Buffer, atSec: number): Promise<Buffer> {
  return scratch(async (file) => {
    await writeFile(file("in.mp4"), video)
    await runTool(
      ffmpeg.ffmpegPath,
      ["-nostdin", "-loglevel", "error", "-y", "-ss", String(atSec), "-protocol_whitelist", "file", "-i", file("in.mp4"), "-frames:v", "1", "-f", "image2", "-c:v", "png", file("out.png")],
      ffmpeg.timeoutMs,
    )
    return readFile(file("out.png"))
  })
}

// Fake mode stands in for a provider download with a short, silent test clip.
async function fakeVideo(): Promise<Buffer> {
  return scratch(async (file) => {
    await runTool(
      ffmpeg.ffmpegPath,
      ["-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1344x768:rate=24:duration=5", "-c:v", "libx264", "-pix_fmt", "yuv420p", file("fake.mp4")],
      ffmpeg.timeoutMs,
    )
    return readFile(file("fake.mp4"))
  })
}

const store = createS3MediaStore({
  endpoint: env.MEDIA_R2_ENDPOINT,
  accessKeyId: env.MEDIA_R2_ACCESS_KEY_ID,
  secretAccessKey: env.MEDIA_R2_SECRET_ACCESS_KEY,
  bucket: env.MEDIA_R2_BUCKET,
})

export const generateDeps: GenerateDeps = {
  db: prisma,
  store,
  llm: live ? createOrchestratorLlm({ url: env.ORCHESTRATOR_URL, secret: env.INTERNAL_SERVICE_SECRET! }) : new FakeLlm(),
  images: live ? new OpenAiImageProvider({ apiKey: env.OPENAI_API_KEY!, model: env.OPENAI_IMAGE_MODEL }) : new FakeImageProvider(),
  video: live ? new RunwareVideoProvider({ apiKey: env.RUNWARE_API_KEY!, model: env.MEDIA_VIDEO_MODEL }) : new FakeVideoProvider(),
  createAsset: (input) => createAssetFromBytes(processDeps, input),
  reserveAsset: (input) => reserveGeneratedAsset(processDeps, input),
  finishReserved: (asset) => finishReservedAsset(processDeps, { ...asset, kind: "VIDEO" }, { stripAudio: true, skipDescribe: true }),
  download: (url) =>
    url.startsWith("fake://") && !live
      ? fakeVideo()
      : safeDownload(url, { allowedHosts: env.MEDIA_PROVIDER_HOST_ALLOWLIST, maxBytes: 200 * 1024 * 1024 }),
  extractFrame,
  semaphores: {
    image: redisSemaphore(redis, "image", env.MEDIA_IMAGE_CONCURRENCY),
    video: redisSemaphore(redis, "video", env.MEDIA_VIDEO_CONCURRENCY),
    // Replaced per job by the runner: concepts are written one video at a time.
    concepts: localSemaphore(1),
  },
  config: {
    ai: loadMediaAiConfig(process.env),
    imageQuality: env.OPENAI_IMAGE_QUALITY,
    videoResolution: env.MEDIA_VIDEO_RESOLUTION,
    videoTimeoutS: env.MEDIA_VIDEO_TIMEOUT_S,
    promptExpansion: env.MEDIA_VIDEO_PROMPT_EXPANSION,
    promptMaxChars: env.MEDIA_VIDEO_PROMPT_MAX_CHARS,
    assetTimeoutMs: env.MEDIA_FFMPEG_TIMEOUT_MS * 2 + 60_000,
    directUpload: live,
  },
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
}
