import type { ResolvedMediaAsset } from "@repo/schemas"
import { api } from "../axios"

export type MediaKind = "IMAGE" | "VIDEO"
export type MediaOrigin = "UPLOADED" | "GENERATED"
export type MediaStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED"

export type MediaItem = {
  id: string
  kind: MediaKind
  origin: MediaOrigin
  status: MediaStatus
  title: string | null
  altText: string | null
  caption: string | null
  decorative: boolean
  width: number | null
  height: number | null
  durationMs: number | null
  hasAudio: boolean | null
  bytes: number
  dominantColor: string | null
  lqip: string | null
  aiGenerated: boolean
  failureReason: string | null
  retryable: boolean
  needsAlt: boolean
  createdAt: string
  thumbUrl: string | null
}

export type MediaUsage = { slotId: string; pageSlug: string; pageTitle: string; sectionType: string; slotKey: string }

export type MediaDetail = MediaItem & {
  usage: MediaUsage[]
  warnings: string[]
  generation: Record<string, unknown> | null
  preview: { image: string | null; video: string | null; poster: string | null }
  variants: { role: string; mime: string; width?: number; height?: number; bytes: number }[]
}

export type MediaQuota = {
  tier: "free" | "paid"
  used: number
  limit: number
  counts: { images: number; videos: number }
  limits: { imagesPerProject: number; videosPerProject: number; maxImageBytes: number; maxVideoBytes: number }
}

export type MediaFilters = { kind?: MediaKind; origin?: MediaOrigin; q?: string }

export type StartUploadResult =
  | { assetId: string; duplicate: true; asset: MediaItem }
  | { assetId: string; duplicate: false; upload: { url: string; headers: Record<string, string>; expiresAt: string } }

type Envelope<T> = { success: true; data: T }

export const mediaApi = {
  list: async (slug: string, filters: MediaFilters & { cursor?: string } = {}) => {
    const { data } = await api.get<Envelope<{ items: MediaItem[]; nextCursor: string | null }>>(
      `/projects/${slug}/media`,
      { params: { ...filters, q: filters.q || undefined } }
    )
    return data.data
  },

  get: async (slug: string, assetId: string) => {
    const { data } = await api.get<Envelope<MediaDetail>>(`/projects/${slug}/media/${assetId}`)
    return data.data
  },

  startUpload: async (slug: string, body: { filename: string; mime: string; bytes: number; sha256?: string }) => {
    const { data } = await api.post<Envelope<StartUploadResult>>(`/projects/${slug}/media/uploads`, body)
    return data.data
  },

  completeUpload: async (slug: string, assetId: string) => {
    const { data } = await api.post<Envelope<MediaItem>>(`/projects/${slug}/media/uploads/${assetId}/complete`)
    return data.data
  },

  update: async (
    slug: string,
    assetId: string,
    body: { title?: string; altText?: string | null; caption?: string | null; decorative?: boolean }
  ) => {
    const { data } = await api.patch<Envelope<MediaItem>>(`/projects/${slug}/media/${assetId}`, body)
    return data.data
  },

  remove: async (slug: string, assetId: string, force = false) => {
    const { data } = await api.delete<Envelope<{ id: string; deleted: true; emptiedSlots: string[] }>>(
      `/projects/${slug}/media/${assetId}`,
      { params: force ? { force: "true" } : undefined }
    )
    return data.data
  },

  retry: async (slug: string, assetId: string) => {
    const { data } = await api.post<Envelope<MediaItem>>(`/projects/${slug}/media/${assetId}/retry`)
    return data.data
  },

  resolve: async (slug: string, assetIds: string[]) => {
    const { data } = await api.post<Envelope<ResolvedMediaAsset[]>>(`/projects/${slug}/media/resolve`, { assetIds })
    return data.data
  },

  quota: async () => {
    const { data } = await api.get<Envelope<MediaQuota>>("/media/quota")
    return data.data
  },
}
