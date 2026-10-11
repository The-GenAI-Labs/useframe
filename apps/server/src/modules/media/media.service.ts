import { Queue } from "bullmq"
import { prisma, type Prisma } from "@useframe/db"
import { QUEUES, type MediaProcessJobPayload } from "@repo/events"
import {
  parseMediaVariants,
  SiteSpecSchema,
  sniffAgrees,
  sniffMediaBytes,
  type MediaVariant,
  type MediaVariantRole,
  type ResolvedMediaAsset,
} from "@repo/schemas"
import { listMediaSlots } from "@repo/site-builder"
import { env } from "@/config/env.js"
import { redis } from "@/lib/redis.js"
import { getMediaStorage, type MediaStorage } from "@/lib/mediaStorage.js"
import { AppError } from "@/middleware/errorHandler.js"
import { CreditsService } from "@/modules/credits/credits.service.js"
import { signMediaUrl } from "./media.signing.js"
import {
  extensionMatches,
  isImageMime,
  isVideoMime,
  safeTitle,
  type ListMediaQuery,
  type MediaMime,
  type PatchMediaInput,
  type StartUploadInput,
} from "./media.schema.js"

const UPLOAD_URL_TTL_SECONDS = 15 * 60
const SNIFF_BYTES = 4096
const MAX_RETRIES = 3
const LIGHT_VIDEO_BYTES = 8 * 1024 * 1024
// Set by the worker for quarantined content; such assets are never retried.
export const FLAGGED_REASON = "This file can't be used"

export type MediaTier = "free" | "paid"

export function mediaLimits(tier: MediaTier) {
  return tier === "paid"
    ? {
        maxImages: env.MEDIA_PAID_MAX_IMAGES,
        maxImageBytes: env.MEDIA_PAID_MAX_IMAGE_BYTES,
        maxVideos: env.MEDIA_PAID_MAX_VIDEOS,
        maxVideoBytes: env.MEDIA_PAID_MAX_VIDEO_BYTES,
        totalBytes: env.MEDIA_PAID_TOTAL_BYTES,
      }
    : {
        maxImages: env.MEDIA_FREE_MAX_IMAGES,
        maxImageBytes: env.MEDIA_FREE_MAX_IMAGE_BYTES,
        maxVideos: 0,
        maxVideoBytes: 0,
        totalBytes: env.MEDIA_FREE_TOTAL_BYTES,
      }
}

// Same predicate as GenerateService.authorize: having credits means the paid path.
export async function mediaTier(userId: string): Promise<MediaTier> {
  return (await CreditsService.getBalance(userId)) > 0 ? "paid" : "free"
}

const ASSET_SELECT = {
  id: true,
  projectId: true,
  kind: true,
  origin: true,
  status: true,
  title: true,
  originalKey: true,
  originalMime: true,
  originalBytes: true,
  width: true,
  height: true,
  durationMs: true,
  hasAudio: true,
  variants: true,
  dominantColor: true,
  lqip: true,
  altText: true,
  caption: true,
  decorative: true,
  aiGenerated: true,
  generation: true,
  failureReason: true,
  retryCount: true,
  deletedAt: true,
  createdAt: true,
} satisfies Prisma.MediaAssetSelect

type AssetRow = Prisma.MediaAssetGetPayload<{ select: typeof ASSET_SELECT }>

let processQueue: Queue<MediaProcessJobPayload> | null = null

function queue(): Queue<MediaProcessJobPayload> {
  processQueue ??= new Queue<MediaProcessJobPayload>(QUEUES.MEDIA_PROCESS, { connection: redis })
  return processQueue
}

async function enqueueProcessing(asset: { id: string; retryCount: number }): Promise<void> {
  await queue().add(
    "process",
    { assetId: asset.id },
    {
      jobId: `${asset.id}-${asset.retryCount}`,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    }
  )
}

function requireStorage(): MediaStorage {
  const storage = getMediaStorage()
  if (!storage || !env.MEDIA_SIGNING_SECRET) {
    throw new AppError("Media storage is not configured", 503, "MEDIA_UNAVAILABLE")
  }
  return storage
}

async function loadProject(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    select: { id: true, currentVersionId: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  return project
}

async function loadAsset(projectId: string, userId: string, assetId: string): Promise<AssetRow> {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, projectId, userId, deletedAt: null },
    select: ASSET_SELECT,
  })
  if (!asset) throw new AppError("Media not found", 404)
  return asset
}

export async function storageUsed(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ used: bigint | number | null }[]>`
    SELECT COALESCE(SUM(
      "originalBytes" + COALESCE((SELECT SUM((v->>'bytes')::bigint) FROM jsonb_array_elements("variants") v), 0)
    ), 0) AS used
    FROM "media_assets"
    WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "status" <> 'FAILED'`
  return Number(rows[0]?.used ?? 0)
}

function assetBytes(asset: Pick<AssetRow, "originalBytes" | "variants">): number {
  return asset.originalBytes + parseMediaVariants(asset.variants).reduce((sum, v) => sum + v.bytes, 0)
}

function sign(asset: Pick<AssetRow, "id">, variants: MediaVariant[], role: MediaVariantRole): string | null {
  return variants.some((v) => v.role === role) ? signMediaUrl(asset.id, role) : null
}

function serialize(asset: AssetRow) {
  const variants = asset.status === "READY" ? parseMediaVariants(asset.variants) : []
  return {
    id: asset.id,
    kind: asset.kind,
    origin: asset.origin,
    status: asset.status,
    title: asset.title,
    altText: asset.altText,
    caption: asset.caption,
    decorative: asset.decorative,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    hasAudio: asset.hasAudio,
    bytes: assetBytes(asset),
    dominantColor: asset.dominantColor,
    lqip: asset.lqip,
    aiGenerated: asset.aiGenerated,
    failureReason: asset.failureReason,
    retryable:
      asset.status === "FAILED" && asset.retryCount < MAX_RETRIES && asset.failureReason !== FLAGGED_REASON,
    needsAlt: !asset.decorative && !asset.altText,
    createdAt: asset.createdAt,
    thumbUrl: sign(asset, variants, "thumb"),
  }
}

export type MediaUsage = { slotId: string; pageSlug: string; pageTitle: string; sectionType: string; slotKey: string }

async function usageOf(project: { currentVersionId: string | null }, assetIds: string[]): Promise<Map<string, MediaUsage[]>> {
  const usage = new Map<string, MediaUsage[]>()
  if (!project.currentVersionId) return usage
  const version = await prisma.projectVersion.findUnique({
    where: { id: project.currentVersionId },
    select: { snapshot: true },
  })
  const spec = SiteSpecSchema.safeParse(version?.snapshot)
  if (!spec.success || !spec.data.media) return usage
  const wanted = new Set(assetIds)
  const slots = new Map(listMediaSlots(spec.data).map((ref) => [ref.slotId, ref]))
  const titles = new Map(spec.data.pages.map((p) => [p.slug, p.title]))
  for (const [slotId, binding] of Object.entries(spec.data.media)) {
    if (!wanted.has(binding.assetId)) continue
    const ref = slots.get(slotId)
    const [pageSlug = "", , slotKey = ""] = slotId.split("/")
    const entry: MediaUsage = {
      slotId,
      pageSlug,
      pageTitle: titles.get(pageSlug) ?? pageSlug,
      sectionType: ref?.section.type ?? "UNKNOWN",
      slotKey: ref?.slot.key ?? slotKey,
    }
    usage.set(binding.assetId, [...(usage.get(binding.assetId) ?? []), entry])
  }
  return usage
}

async function failAsset(storage: MediaStorage, asset: AssetRow, reason: string): Promise<never> {
  await storage.deletePrefix(`media/${asset.projectId}/${asset.id}/`)
  await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "FAILED", failureReason: reason } })
  throw new AppError(reason, 422, "MEDIA_REJECTED", { data: { id: asset.id, status: "FAILED", failureReason: reason } })
}

async function readHead(body: AsyncIterable<Uint8Array | string>): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of body) {
    const buf = Buffer.from(chunk)
    chunks.push(buf)
    size += buf.length
    if (size >= SNIFF_BYTES) break
  }
  return Buffer.concat(chunks).subarray(0, SNIFF_BYTES)
}

export const MediaService = {
  async startUpload(userId: string, slug: string, input: StartUploadInput) {
    const storage = requireStorage()
    const project = await loadProject(userId, slug)

    if (input.mime === "image/heic" || input.mime === "image/heif") {
      throw new AppError("Please export as JPEG or PNG", 415, "MEDIA_TYPE")
    }
    const kind = isImageMime(input.mime) ? "IMAGE" : isVideoMime(input.mime) ? "VIDEO" : null
    if (!kind) {
      throw new AppError("Use a JPEG, PNG, WebP or AVIF image, or an MP4, MOV or WebM video", 415, "MEDIA_TYPE")
    }
    const mime = input.mime as MediaMime
    if (!extensionMatches(input.filename, mime)) {
      throw new AppError("The file extension doesn't match its type", 415, "MEDIA_TYPE")
    }

    if (input.sha256) {
      const existing = await prisma.mediaAsset.findFirst({
        where: { projectId: project.id, sha256: input.sha256, status: "READY", deletedAt: null },
        select: ASSET_SELECT,
      })
      if (existing) return { assetId: existing.id, duplicate: true as const, asset: serialize(existing) }
    }

    const tier = await mediaTier(userId)
    const limits = mediaLimits(tier)
    if (kind === "VIDEO" && tier === "free") {
      throw new AppError("Video uploads are available on paid plans", 403, "MEDIA_PAID_ONLY")
    }
    const maxBytes = kind === "VIDEO" ? limits.maxVideoBytes : limits.maxImageBytes
    if (input.bytes > maxBytes) {
      throw new AppError(`${kind === "VIDEO" ? "Videos" : "Images"} can be up to ${Math.floor(maxBytes / 1048576)} MB`, 413, "MEDIA_TOO_LARGE")
    }
    const [count, used] = await Promise.all([
      prisma.mediaAsset.count({
        where: { projectId: project.id, kind, origin: "UPLOADED", deletedAt: null, status: { not: "FAILED" } },
      }),
      storageUsed(userId),
    ])
    const maxCount = kind === "VIDEO" ? limits.maxVideos : limits.maxImages
    if (count >= maxCount) {
      throw new AppError(
        `This project already has ${maxCount} ${kind === "VIDEO" ? "videos" : "images"}, the most your plan allows`,
        403,
        "MEDIA_COUNT_LIMIT"
      )
    }
    if (used + input.bytes > limits.totalBytes) {
      throw new AppError("You've used all of your media storage", 403, "MEDIA_STORAGE_FULL")
    }

    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          projectId: project.id,
          userId,
          kind,
          title: safeTitle(input.filename),
          originalKey: "",
          originalMime: mime,
          originalBytes: input.bytes,
        },
        select: { id: true },
      })
      return tx.mediaAsset.update({
        where: { id: created.id },
        data: { originalKey: `media/${project.id}/${created.id}/orig` },
        select: { id: true, originalKey: true },
      })
    })

    const upload = await storage.presignPut(asset.originalKey, mime, input.bytes, UPLOAD_URL_TTL_SECONDS)
    return {
      assetId: asset.id,
      duplicate: false as const,
      upload: { ...upload, expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString() },
    }
  },

  async completeUpload(userId: string, slug: string, assetId: string) {
    const storage = requireStorage()
    const project = await loadProject(userId, slug)
    const asset = await loadAsset(project.id, userId, assetId)
    if (asset.status !== "UPLOADING") return serialize(asset)

    const head = await storage.head(asset.originalKey)
    if (!head) throw new AppError("The upload hasn't arrived yet", 409, "MEDIA_NOT_UPLOADED")
    // Re-checked here because a client can bypass the signed Content-Length.
    if (head.size !== asset.originalBytes) {
      await failAsset(storage, asset, "The uploaded file didn't match its declared size")
    }
    const tier = await mediaTier(userId)
    const limits = mediaLimits(tier)
    if (head.size > (asset.kind === "VIDEO" ? limits.maxVideoBytes : limits.maxImageBytes)) {
      await failAsset(storage, asset, "The file is larger than your plan allows")
    }
    const object = await storage.get(asset.originalKey, { start: 0, end: SNIFF_BYTES - 1 })
    const bytes = object ? await readHead(object.body) : Buffer.alloc(0)
    object?.body.destroy()
    if (!sniffAgrees(asset.originalMime, sniffMediaBytes(bytes))) {
      await failAsset(storage, asset, "The file's contents don't match its type")
    }

    const updated = await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: "PROCESSING" },
      select: ASSET_SELECT,
    })
    await enqueueProcessing(updated)
    return serialize(updated)
  },

  async list(userId: string, slug: string, query: ListMediaQuery) {
    requireStorage()
    const project = await loadProject(userId, slug)
    const where: Prisma.MediaAssetWhereInput = {
      projectId: project.id,
      userId,
      deletedAt: null,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.origin ? { origin: query.origin } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { altText: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    }
    const rows = await prisma.mediaAsset.findMany({
      where,
      select: ASSET_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    })
    const page = rows.slice(0, query.limit)
    return { items: page.map(serialize), nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null }
  },

  async get(userId: string, slug: string, assetId: string) {
    requireStorage()
    const project = await loadProject(userId, slug)
    const asset = await loadAsset(project.id, userId, assetId)
    const variants = asset.status === "READY" ? parseMediaVariants(asset.variants) : []
    const usage = (await usageOf(project, [asset.id])).get(asset.id) ?? []
    const warnings: string[] = []
    const v720 = variants.find((v) => v.role === "mp4_720")
    if (v720 && v720.bytes > LIGHT_VIDEO_BYTES) {
      warnings.push("This video is over 8 MB. Background videos load best when they're shorter or lighter.")
    }
    return {
      ...serialize(asset),
      usage,
      warnings,
      generation: asset.aiGenerated ? asset.generation : null,
      preview: {
        image: sign(asset, variants, "w1600") ?? sign(asset, variants, "fallback"),
        video: sign(asset, variants, "mp4_720"),
        poster: sign(asset, variants, "poster"),
      },
      variants: variants.map((v) => ({ role: v.role, mime: v.mime, width: v.width, height: v.height, bytes: v.bytes })),
    }
  },

  async patch(userId: string, slug: string, assetId: string, input: PatchMediaInput) {
    const project = await loadProject(userId, slug)
    await loadAsset(project.id, userId, assetId)
    const updated = await prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.altText !== undefined ? { altText: input.altText || null } : {}),
        ...(input.caption !== undefined ? { caption: input.caption || null } : {}),
        ...(input.decorative !== undefined ? { decorative: input.decorative } : {}),
      },
      select: ASSET_SELECT,
    })
    return serialize(updated)
  },

  async remove(userId: string, slug: string, assetId: string, force: boolean) {
    const project = await loadProject(userId, slug)
    const asset = await loadAsset(project.id, userId, assetId)
    const usage = (await usageOf(project, [asset.id])).get(asset.id) ?? []
    if (usage.length > 0 && !force) {
      throw new AppError("This media is used on your site", 409, "MEDIA_IN_USE", { data: { usage } })
    }
    // Bindings to a deleted asset are dropped by the builder on the next build.
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { deletedAt: new Date() } })
    return { id: asset.id, deleted: true, emptiedSlots: usage.map((u) => u.slotId) }
  },

  async retry(userId: string, slug: string, assetId: string) {
    const storage = requireStorage()
    const project = await loadProject(userId, slug)
    const asset = await loadAsset(project.id, userId, assetId)
    if (asset.status !== "FAILED") throw new AppError("Only failed media can be retried", 409, "MEDIA_NOT_FAILED")
    if (asset.failureReason === FLAGGED_REASON || asset.retryCount >= MAX_RETRIES) {
      throw new AppError("This file can't be retried. Please upload it again.", 409, "MEDIA_RETRY_LIMIT")
    }
    if (!(await storage.head(asset.originalKey))) {
      throw new AppError("The original file is gone. Please upload it again.", 409, "MEDIA_RETRY_LIMIT")
    }
    const updated = await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: "PROCESSING", failureReason: null, retryCount: { increment: 1 } },
      select: ASSET_SELECT,
    })
    await enqueueProcessing(updated)
    return serialize(updated)
  },

  async quota(userId: string) {
    const tier = await mediaTier(userId)
    const limits = mediaLimits(tier)
    const [used, images, videos] = await Promise.all([
      storageUsed(userId),
      prisma.mediaAsset.count({ where: { userId, kind: "IMAGE", origin: "UPLOADED", deletedAt: null, status: { not: "FAILED" } } }),
      prisma.mediaAsset.count({ where: { userId, kind: "VIDEO", origin: "UPLOADED", deletedAt: null, status: { not: "FAILED" } } }),
    ])
    return {
      tier,
      used,
      limit: limits.totalBytes,
      counts: { images, videos },
      limits: {
        imagesPerProject: limits.maxImages,
        videosPerProject: limits.maxVideos,
        maxImageBytes: limits.maxImageBytes,
        maxVideoBytes: limits.maxVideoBytes,
      },
    }
  },

  // Signed variant URLs for the in-browser preview; the browser cannot sign.
  async resolveForPreview(userId: string, slug: string, assetIds: string[]): Promise<ResolvedMediaAsset[]> {
    requireStorage()
    const project = await loadProject(userId, slug)
    if (assetIds.length === 0) return []
    const assets = await prisma.mediaAsset.findMany({
      where: { id: { in: assetIds }, projectId: project.id, userId, deletedAt: null, status: "READY" },
      select: ASSET_SELECT,
    })
    return assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      origin: asset.origin,
      status: asset.status,
      deleted: false,
      title: asset.title,
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs,
      dominantColor: asset.dominantColor,
      lqip: asset.lqip,
      altText: asset.altText,
      decorative: asset.decorative,
      variants: parseMediaVariants(asset.variants).map((v) => ({
        role: v.role,
        mime: v.mime,
        width: v.width,
        height: v.height,
        bytes: v.bytes,
        sha256: v.sha256,
        url: signMediaUrl(asset.id, v.role),
      })),
    }))
  },

  async servable(assetId: string, role: MediaVariantRole) {
    const asset = await prisma.mediaAsset.findFirst({
      where: { id: assetId, deletedAt: null, status: "READY" },
      select: { variants: true },
    })
    return asset ? (parseMediaVariants(asset.variants).find((v) => v.role === role) ?? null) : null
  },
}
