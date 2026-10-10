import { z } from "zod"
import {
  UPLOAD_IMAGE_MIMES as IMAGE_MIMES,
  UPLOAD_VIDEO_MIMES as VIDEO_MIMES,
  type UploadMediaMime as MediaMime,
} from "@repo/schemas"

export type { MediaMime }

const EXTENSIONS: Record<MediaMime, string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
  "video/mp4": ["mp4", "m4v"],
  "video/quicktime": ["mov"],
  "video/webm": ["webm"],
}

export function isImageMime(mime: string): boolean {
  return (IMAGE_MIMES as readonly string[]).includes(mime)
}

export function isVideoMime(mime: string): boolean {
  return (VIDEO_MIMES as readonly string[]).includes(mime)
}

export function extensionMatches(filename: string, mime: MediaMime): boolean {
  const ext = /\.([A-Za-z0-9]{1,5})$/.exec(filename)?.[1]?.toLowerCase()
  return !!ext && EXTENSIONS[mime].includes(ext)
}

export const StartUploadSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mime: z.string().trim().toLowerCase().max(100),
  bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
})
export type StartUploadInput = z.infer<typeof StartUploadSchema>

export const PatchMediaSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    altText: z.string().trim().max(200).nullable().optional(),
    caption: z.string().trim().max(500).nullable().optional(),
    decorative: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")
export type PatchMediaInput = z.infer<typeof PatchMediaSchema>

export const ListMediaQuerySchema = z.object({
  kind: z.enum(["IMAGE", "VIDEO"]).optional(),
  origin: z.enum(["UPLOADED", "GENERATED"]).optional(),
  status: z.enum(["UPLOADING", "PROCESSING", "READY", "FAILED"]).optional(),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
})
export type ListMediaQuery = z.infer<typeof ListMediaQuerySchema>

export const ResolveMediaSchema = z.object({
  assetIds: z.array(z.string().min(1).max(64)).max(200),
})
export type ResolveMediaInput = z.infer<typeof ResolveMediaSchema>

export function safeTitle(filename: string): string {
  const base = filename.replace(/\.[A-Za-z0-9]{1,5}$/, "")
  const cleaned = base.replace(/[^\w.\- ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
  return cleaned || "Untitled"
}
