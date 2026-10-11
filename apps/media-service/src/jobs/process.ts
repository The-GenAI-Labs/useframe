import { randomUUID } from "node:crypto"
import { mkdir, open, rm } from "node:fs/promises"
import path from "node:path"
import type { MediaProcessJobPayload } from "@repo/events"
import { sniffAgrees, sniffMediaBytes, type MediaVariant } from "@repo/schemas"
import { FLAGGED_REASON, mediaPrefix, type Deps } from "@/deps.js"
import { errorMessage, log, metric } from "@/lib/logger.js"
import { mapWithConcurrency, withRetry } from "@/lib/retry.js"
import { isTransientStorageError, TooLargeError } from "@/lib/storage.js"
import { MediaRejectedError } from "@/processing/errors.js"
import { processImage } from "@/processing/image.js"
import type { ProcessedMedia } from "@/processing/types.js"
import { processVideo } from "@/processing/video.js"

export type Attempt = { attemptsMade: number; attempts: number }

const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "video/mp4": "mp4" }

async function readHead(file: string): Promise<Buffer> {
  const handle = await open(file, "r")
  try {
    const buf = Buffer.alloc(4096)
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

async function userTier(deps: Deps, userId: string): Promise<"free" | "paid"> {
  const balance = await deps.db.creditBalance.findUnique({ where: { userId }, select: { balance: true } })
  return (balance?.balance ?? 0) > 0 ? "paid" : "free"
}

async function markFailed(deps: Deps, assetId: string, reason: string): Promise<void> {
  await deps.db.mediaAsset.updateMany({
    where: { id: assetId, status: "PROCESSING" },
    data: { status: "FAILED", failureReason: reason },
  })
}

export async function processAsset(deps: Deps, payload: MediaProcessJobPayload, attempt: Attempt): Promise<void> {
  const started = Date.now()
  const asset = await deps.db.mediaAsset.findUnique({
    where: { id: payload.assetId },
    select: {
      id: true,
      projectId: true,
      userId: true,
      kind: true,
      status: true,
      originalKey: true,
      originalMime: true,
      altText: true,
      deletedAt: true,
    },
  })
  if (!asset || asset.deletedAt || asset.status !== "PROCESSING") {
    log.info("media job skipped", { assetId: payload.assetId, status: asset?.status ?? "missing" })
    return
  }
  const options = payload.options ?? {}
  const prefix = mediaPrefix(asset.projectId, asset.id)
  const dir = path.join(deps.config.workDir, `${asset.id}-${randomUUID()}`)

  try {
    await mkdir(path.join(dir, "out"), { recursive: true, mode: 0o700 })
    const input = path.join(dir, "orig")
    const maxBytes = asset.kind === "VIDEO" ? deps.config.maxVideoBytes : deps.config.maxImageBytes
    let original: { bytes: number; sha256: string } | null
    try {
      original = await deps.store.download(asset.originalKey, input, maxBytes)
    } catch (err) {
      if (err instanceof TooLargeError)
        throw new MediaRejectedError("The file is larger than allowed", "download limit")
      throw err
    }
    if (!original) throw new MediaRejectedError("The upload is missing. Please upload it again.", "no original")
    if (!sniffAgrees(asset.originalMime, sniffMediaBytes(await readHead(input)))) {
      throw new MediaRejectedError("The file's contents don't match its type", "worker sniff")
    }

    const out = path.join(dir, "out")
    const processed: ProcessedMedia =
      asset.kind === "IMAGE"
        ? await processImage(input, out, { maxInputPixels: deps.config.maxInputPixels })
        : await processVideo(deps.config.ffmpeg, input, out, {
            maxSeconds: deps.config.maxVideoSeconds,
            stripAudio: !!options.stripAudio,
          })

    const variants: MediaVariant[] = await mapWithConcurrency(processed.variants, 4, async (v) => {
      const key = `${prefix}v/${v.role}.${EXT[v.mime] ?? "bin"}`
      await withRetry(() => deps.store.uploadFile(key, v.path, v.bytes, v.mime), {
        attempts: 3,
        baseDelayMs: 500,
        shouldRetry: isTransientStorageError,
      })
      return { role: v.role, key, mime: v.mime, width: v.width, height: v.height, bytes: v.bytes, sha256: v.sha256 }
    })

    let described: Awaited<ReturnType<NonNullable<Deps["describe"]>>> = null
    if (!options.skipDescribe && deps.describe && processed.describeImage) {
      described = await deps.describe({
        imagePath: processed.describeImage,
        tier: await userTier(deps, asset.userId),
        assetId: asset.id,
      })
      if (described?.flagged) {
        // Quarantined: kept in the bucket for review, never served (only READY assets are).
        await deps.db.mediaAsset.updateMany({
          where: { id: asset.id, status: "PROCESSING" },
          data: { status: "FAILED", failureReason: FLAGGED_REASON, sha256: original.sha256, variants },
        })
        await deps.db.pipelineLog.upsert({
          where: { jobId: `media-flag-${asset.id}` },
          create: {
            projectId: asset.projectId,
            jobId: `media-flag-${asset.id}`,
            stage: "FAILED",
            status: "MEDIA_FLAGGED",
          },
          update: {},
        })
        log.warn("media flagged for review", { assetId: asset.id })
        return
      }
    }

    // updateMany so a delete that raced this job is never undone.
    const updated = await deps.db.mediaAsset.updateMany({
      where: { id: asset.id, status: "PROCESSING", deletedAt: null },
      data: {
        status: "READY",
        sha256: original.sha256,
        width: processed.width,
        height: processed.height,
        durationMs: processed.durationMs ?? null,
        hasAudio: processed.hasAudio ?? null,
        variants,
        dominantColor: processed.dominantColor,
        lqip: processed.lqip,
        failureReason: null,
        ...(described
          ? {
              description: described.description,
              suggestedPurposes: described.suggestedPurposes,
              ...(asset.altText ? {} : { altText: described.altText }),
            }
          : {}),
      },
    })
    if (updated.count === 0) await deps.store.deletePrefix(`${prefix}v/`)
    metric("media.processed", Date.now() - started, {
      assetId: asset.id,
      kind: asset.kind,
      variants: variants.length,
      bytes: original.bytes,
      described: !!described,
      warnings: processed.warnings.length,
    })
  } catch (err) {
    if (err instanceof MediaRejectedError) {
      log.warn("media rejected", { assetId: asset.id, reason: err.publicReason, detail: err.detail })
      await deps.store
        .deletePrefix(prefix)
        .catch((e) => log.warn("media cleanup failed", { assetId: asset.id, error: errorMessage(e) }))
      await markFailed(deps, asset.id, err.publicReason)
      return
    }
    log.error("media processing error", {
      assetId: asset.id,
      attempt: attempt.attemptsMade + 1,
      error: errorMessage(err),
    })
    if (attempt.attemptsMade + 1 >= attempt.attempts) {
      await deps.store.deletePrefix(`${prefix}v/`).catch(() => undefined)
      await markFailed(deps, asset.id, "We couldn't process this file. Please try again.")
    }
    throw err
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch((err) =>
      log.warn("media scratch cleanup failed", { assetId: asset.id, error: errorMessage(err) }),
    )
  }
}
