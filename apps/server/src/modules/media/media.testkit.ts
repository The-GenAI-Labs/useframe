import { Readable } from "node:stream"
import type { MediaStorage } from "@/lib/mediaStorage.js"

// In-memory stand-ins for Prisma and the media bucket, shared by the media tests.

export const TEST_ENV = {
  NODE_ENV: "test",
  CLIENT_URL: "http://localhost:3000",
  FRONTEND_URL: "http://localhost:3000",
  MEDIA_R2_BUCKET: "useframe-media",
  MEDIA_SIGNING_SECRET: "test-media-signing-secret-0123456789abcdef",
  MEDIA_SIGNED_URL_TTL_SECONDS: 3600,
  MEDIA_PUBLIC_BASE_URL: "http://localhost:4000",
  MEDIA_CORS_ORIGINS: "https://app.useframe.in",
  MEDIA_FREE_MAX_IMAGES: 2,
  MEDIA_FREE_MAX_IMAGE_BYTES: 5 * 1024 * 1024,
  MEDIA_FREE_TOTAL_BYTES: 100 * 1024 * 1024,
  MEDIA_PAID_MAX_IMAGES: 100,
  MEDIA_PAID_MAX_IMAGE_BYTES: 20 * 1024 * 1024,
  MEDIA_PAID_MAX_VIDEOS: 1,
  MEDIA_PAID_MAX_VIDEO_BYTES: 150 * 1024 * 1024,
  MEDIA_PAID_TOTAL_BYTES: 5 * 1024 * 1024 * 1024,
}

type Row = Record<string, unknown>

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Row[]).some((c) => matches(row, c))
    const value = row[key]
    if (cond === null) return value === null || value === undefined
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { not?: unknown; in?: unknown[]; contains?: string }
      if ("not" in c) return value !== c.not
      if (c.in) return c.in.includes(value)
      if (c.contains !== undefined) return String(value ?? "").toLowerCase().includes(c.contains.toLowerCase())
    }
    return value === cond
  })
}

export function createFakeDb() {
  const projects: Row[] = []
  const versions: Row[] = []
  const assets: Row[] = []
  let seq = 0

  const apply = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === "object" && "increment" in (value as Row)) {
        row[key] = (row[key] as number) + ((value as { increment: number }).increment)
      } else row[key] = value
    }
    row.updatedAt = new Date()
    return row
  }

  const mediaAsset = {
    findFirst: async ({ where }: { where?: Row }) => assets.find((a) => matches(a, where)) ?? null,
    findUnique: async ({ where }: { where: Row }) => assets.find((a) => a.id === where.id) ?? null,
    findMany: async ({ where, take, cursor, skip }: { where?: Row; take?: number; cursor?: { id: string }; skip?: number }) => {
      let rows = assets.filter((a) => matches(a, where)).sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime() || String(b.id).localeCompare(String(a.id)))
      if (cursor) rows = rows.slice(rows.findIndex((r) => r.id === cursor.id) + (skip ?? 0))
      return take ? rows.slice(0, take) : rows
    },
    count: async ({ where }: { where?: Row }) => assets.filter((a) => matches(a, where)).length,
    create: async ({ data }: { data: Row }) => {
      const row: Row = {
        id: `asset${++seq}`,
        origin: "UPLOADED",
        status: "UPLOADING",
        variants: [],
        decorative: false,
        aiGenerated: false,
        retryCount: 0,
        deletedAt: null,
        sha256: null,
        altText: null,
        caption: null,
        width: null,
        height: null,
        durationMs: null,
        hasAudio: null,
        dominantColor: null,
        lqip: null,
        generation: null,
        failureReason: null,
        createdAt: new Date(Date.now() + seq),
        ...data,
      }
      assets.push(row)
      return row
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const row = assets.find((a) => a.id === where.id)
      if (!row) throw new Error("not found")
      return apply(row, data)
    },
  }

  const db = {
    project: { findFirst: async ({ where }: { where?: Row }) => projects.find((p) => matches(p, where)) ?? null },
    projectVersion: { findUnique: async ({ where }: { where: Row }) => versions.find((v) => v.id === where.id) ?? null },
    mediaAsset,
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
    $queryRaw: async (_strings: TemplateStringsArray, userId: string) => {
      const used = assets
        .filter((a) => a.userId === userId && a.deletedAt === null && a.status !== "FAILED")
        .reduce((sum, a) => sum + (a.originalBytes as number) + (a.variants as { bytes: number }[]).reduce((s, v) => s + v.bytes, 0), 0)
      return [{ used }]
    },
  }
  return { db, projects, versions, assets }
}

export function createFakeStorage(): MediaStorage & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>()
  return {
    objects,
    async presignPut(key, contentType, contentLength) {
      return {
        url: `https://fake-r2.test/${key}?X-Amz-Signature=x`,
        headers: { "Content-Type": contentType, "Content-Length": String(contentLength) },
      }
    },
    async head(key) {
      const obj = objects.get(key)
      return obj ? { size: obj.length } : null
    },
    async get(key, range) {
      const obj = objects.get(key)
      if (!obj) return null
      const slice = range ? obj.subarray(range.start, range.end + 1) : obj
      return { body: Readable.from([slice]), contentLength: slice.length }
    },
    async deletePrefix(prefix) {
      let n = 0
      for (const key of [...objects.keys()]) if (key.startsWith(prefix) && objects.delete(key)) n++
      return n
    },
  }
}

export const JPEG_HEAD = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)])
export const PNG_HEAD = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)])
export const MP4_HEAD = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(100)])
export const SVG_BODY = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
