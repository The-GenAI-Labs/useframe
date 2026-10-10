import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeDb, createFakeStorage, JPEG_HEAD, MP4_HEAD, PNG_HEAD, SVG_BODY, TEST_ENV } from "./media.testkit.js"

const m = vi.hoisted(() => ({ fake: null as ReturnType<typeof createFakeDb> | null, balance: 0, add: vi.fn() }))

vi.mock("@/config/env.js", () => ({ env: TEST_ENV }))
vi.mock("@useframe/db", () => ({
  get prisma() {
    return m.fake!.db
  },
}))
vi.mock("@/lib/redis.js", () => ({ redis: {} }))
vi.mock("bullmq", () => ({ Queue: class { add = m.add } }))
vi.mock("@/modules/credits/credits.service.js", () => ({
  CreditsService: { getBalance: async () => m.balance },
}))

const { setMediaStorageForTests } = await import("@/lib/mediaStorage.js")
const { MediaService, FLAGGED_REASON } = await import("./media.service.js")

const A = "userA"
const B = "userB"
let storage: ReturnType<typeof createFakeStorage>

function readyAsset(overrides: Record<string, unknown> = {}) {
  return m.fake!.db.mediaAsset.create({
    data: {
      projectId: "projA",
      userId: A,
      kind: "IMAGE",
      title: "Hero",
      originalKey: "media/projA/x/orig",
      originalMime: "image/jpeg",
      originalBytes: 1000,
      status: "READY",
      variants: [
        { role: "thumb", key: "media/projA/x/v/thumb.webp", mime: "image/webp", width: 320, height: 180, bytes: 100, sha256: "a".repeat(64) },
        { role: "mp4_720", key: "media/projA/x/v/mp4_720.mp4", mime: "video/mp4", width: 1280, height: 720, bytes: 9 * 1024 * 1024, sha256: "b".repeat(64) },
      ],
      ...overrides,
    },
  })
}

async function start(userId: string, input: { filename: string; mime: string; bytes: number; sha256?: string }) {
  return MediaService.startUpload(userId, "proj-a", input)
}

beforeEach(() => {
  m.fake = createFakeDb()
  m.fake.projects.push(
    { id: "projA", slug: "proj-a", userId: A, deletedAt: null, currentVersionId: "verA" },
    { id: "projB", slug: "proj-b", userId: B, deletedAt: null, currentVersionId: null }
  )
  m.balance = 0
  m.add.mockReset()
  storage = createFakeStorage()
  setMediaStorageForTests(storage)
})

describe("startUpload", () => {
  it("creates an UPLOADING asset and a presigned PUT to its orig key", async () => {
    const res = await start(A, { filename: "Team Photo.JPG", mime: "image/jpeg", bytes: 1234 })
    if (res.duplicate) throw new Error("unexpected duplicate")
    const asset = m.fake!.assets[0]!
    expect(asset).toMatchObject({ status: "UPLOADING", kind: "IMAGE", title: "Team Photo", originalBytes: 1234 })
    expect(asset.originalKey).toBe(`media/projA/${asset.id}/orig`)
    expect(res.upload.url).toContain(`media/projA/${asset.id}/orig`)
    expect(res.upload.headers).toEqual({ "Content-Type": "image/jpeg", "Content-Length": "1234" })
  })

  it("rejects SVG, GIF, HEIC and mismatched extensions", async () => {
    await expect(start(A, { filename: "a.svg", mime: "image/svg+xml", bytes: 10 })).rejects.toMatchObject({ statusCode: 415 })
    await expect(start(A, { filename: "a.gif", mime: "image/gif", bytes: 10 })).rejects.toMatchObject({ statusCode: 415 })
    await expect(start(A, { filename: "a.heic", mime: "image/heic", bytes: 10 })).rejects.toThrow("Please export as JPEG or PNG")
    await expect(start(A, { filename: "a.png", mime: "image/jpeg", bytes: 10 })).rejects.toThrow("extension")
  })

  it("enforces free-tier rules: images only, per-file size and per-project count", async () => {
    await expect(start(A, { filename: "a.mp4", mime: "video/mp4", bytes: 10 })).rejects.toMatchObject({
      statusCode: 403,
      code: "MEDIA_PAID_ONLY",
      message: "Video uploads are available on paid plans",
    })
    await expect(start(A, { filename: "a.jpg", mime: "image/jpeg", bytes: 6 * 1024 * 1024 })).rejects.toMatchObject({ statusCode: 413 })
    await start(A, { filename: "1.jpg", mime: "image/jpeg", bytes: 10 })
    await start(A, { filename: "2.jpg", mime: "image/jpeg", bytes: 10 })
    await expect(start(A, { filename: "3.jpg", mime: "image/jpeg", bytes: 10 })).rejects.toMatchObject({ code: "MEDIA_COUNT_LIMIT" })
  })

  it("lets paid users upload video within limits", async () => {
    m.balance = 5
    await start(A, { filename: "clip.mov", mime: "video/quicktime", bytes: 10 })
    await expect(start(A, { filename: "b.mp4", mime: "video/mp4", bytes: 10 })).rejects.toMatchObject({ code: "MEDIA_COUNT_LIMIT" })
    await expect(start(A, { filename: "big.jpg", mime: "image/jpeg", bytes: 21 * 1024 * 1024 })).rejects.toMatchObject({ statusCode: 413 })
  })

  it("enforces the per-user storage total across projects", async () => {
    await m.fake!.db.mediaAsset.create({
      data: { projectId: "other", userId: A, kind: "IMAGE", originalKey: "k", originalMime: "image/jpeg", originalBytes: 100 * 1024 * 1024 - 5, status: "READY" },
    })
    await expect(start(A, { filename: "a.jpg", mime: "image/jpeg", bytes: 10 })).rejects.toMatchObject({ code: "MEDIA_STORAGE_FULL" })
  })

  it("returns the existing READY asset for a duplicate sha256 instead of a new upload", async () => {
    const existing = await readyAsset({ sha256: "c".repeat(64) })
    const res = await start(A, { filename: "again.jpg", mime: "image/jpeg", bytes: 1000, sha256: "c".repeat(64) })
    expect(res).toMatchObject({ assetId: existing.id, duplicate: true })
    expect(m.fake!.assets).toHaveLength(1)
  })

  it("answers 503 when storage is not configured", async () => {
    setMediaStorageForTests(null)
    await expect(start(A, { filename: "a.jpg", mime: "image/jpeg", bytes: 10 })).rejects.toMatchObject({ statusCode: 503 })
  })
})

describe("completeUpload", () => {
  async function uploaded(body: Buffer, filename = "a.jpg", mime = "image/jpeg", declared = body.length) {
    const res = await start(A, { filename, mime, bytes: declared })
    const asset = m.fake!.assets.find((a) => a.id === res.assetId)!
    storage.objects.set(asset.originalKey as string, body)
    return asset
  }

  it("moves a verified upload to PROCESSING and enqueues media processing", async () => {
    const asset = await uploaded(JPEG_HEAD)
    const res = await MediaService.completeUpload(A, "proj-a", asset.id as string)
    expect(res.status).toBe("PROCESSING")
    expect(m.add).toHaveBeenCalledWith("process", { assetId: asset.id }, expect.objectContaining({ jobId: `${asset.id}-0`, attempts: 3 }))
  })

  it("fails and deletes an upload whose size differs from the declared size", async () => {
    const asset = await uploaded(JPEG_HEAD, "a.jpg", "image/jpeg", JPEG_HEAD.length + 1)
    await expect(MediaService.completeUpload(A, "proj-a", asset.id as string)).rejects.toMatchObject({ statusCode: 422 })
    expect(asset).toMatchObject({ status: "FAILED", failureReason: "The uploaded file didn't match its declared size" })
    expect(storage.objects.size).toBe(0)
    expect(m.add).not.toHaveBeenCalled()
  })

  it("fails an upload whose magic bytes contradict its declared type (SVG renamed .png, PNG sent as JPEG)", async () => {
    const svg = await uploaded(SVG_BODY, "logo.png", "image/png")
    await expect(MediaService.completeUpload(A, "proj-a", svg.id as string)).rejects.toThrow("contents don't match")
    expect(svg.status).toBe("FAILED")
    const png = await uploaded(PNG_HEAD, "photo.jpg", "image/jpeg")
    await expect(MediaService.completeUpload(A, "proj-a", png.id as string)).rejects.toMatchObject({ statusCode: 422 })
    expect(storage.objects.size).toBe(0)
  })

  it("accepts an MP4 declared as QuickTime (same container family)", async () => {
    m.balance = 1
    const asset = await uploaded(MP4_HEAD, "clip.mov", "video/quicktime")
    expect((await MediaService.completeUpload(A, "proj-a", asset.id as string)).status).toBe("PROCESSING")
  })

  it("asks the client to retry when the object has not arrived", async () => {
    const res = await start(A, { filename: "a.jpg", mime: "image/jpeg", bytes: 10 })
    await expect(MediaService.completeUpload(A, "proj-a", res.assetId)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("ownership (IDOR)", () => {
  it("answers 404 for another user's project or asset on every operation", async () => {
    const asset = await readyAsset()
    const id = asset.id as string
    const calls: Array<() => Promise<unknown>> = [
      () => MediaService.startUpload(B, "proj-a", { filename: "a.jpg", mime: "image/jpeg", bytes: 1 }),
      () => MediaService.completeUpload(B, "proj-a", id),
      () => MediaService.list(B, "proj-a", { limit: 10 }),
      () => MediaService.get(B, "proj-a", id),
      () => MediaService.patch(B, "proj-a", id, { altText: "x" }),
      () => MediaService.remove(B, "proj-a", id, true),
      () => MediaService.retry(B, "proj-a", id),
      () => MediaService.resolveForPreview(B, "proj-a", [id]),
      // B's own project, A's asset id:
      () => MediaService.get(B, "proj-b", id),
      () => MediaService.patch(B, "proj-b", id, { altText: "x" }),
      () => MediaService.remove(B, "proj-b", id, true),
      () => MediaService.completeUpload(B, "proj-b", id),
    ]
    for (const call of calls) await expect(call()).rejects.toMatchObject({ statusCode: 404 })
    expect(await MediaService.resolveForPreview(B, "proj-b", [id])).toEqual([])
    expect(asset.deletedAt).toBeNull()
  })
})

describe("list, get and patch", () => {
  it("paginates newest first, filters, and signs thumbnails", async () => {
    for (let i = 0; i < 3; i++) await readyAsset({ title: `Photo ${i}` })
    await readyAsset({ kind: "VIDEO", title: "Clip" })
    const first = await MediaService.list(A, "proj-a", { limit: 2 })
    expect(first.items.map((i) => i.title)).toEqual(["Clip", "Photo 2"])
    expect(first.items[0]!.thumbUrl).toMatch(/^http:\/\/localhost:4000\/media\/asset\d+\/thumb\?exp=\d+&sig=[0-9a-f]{64}$/)
    const second = await MediaService.list(A, "proj-a", { limit: 2, cursor: first.nextCursor! })
    expect(second.items.map((i) => i.title)).toEqual(["Photo 1", "Photo 0"])
    expect((await MediaService.list(A, "proj-a", { limit: 10, kind: "VIDEO" })).items).toHaveLength(1)
    expect((await MediaService.list(A, "proj-a", { limit: 10, q: "photo 1" })).items).toHaveLength(1)
  })

  it("returns usage from the current version and a light-video warning", async () => {
    const asset = await readyAsset()
    m.fake!.versions.push({
      id: "verA",
      snapshot: {
        siteType: "SINGLE_PAGE",
        copyFramework: "AIDA",
        citations: [],
        designSystem: { primaryColor: "#000000", secondaryColor: "#000000", accentColor: "#000000", fontPrimary: "Inter", fontSecondary: "Inter", spacing: "", borderRadius: "md", animationStyle: "" },
        pages: [{ type: "HOME", slug: "home", title: "Home", sections: [{ type: "HERO", index: 0 }] }],
        media: { "home/hero-0/background": { assetId: asset.id } },
      },
    })
    const detail = await MediaService.get(A, "proj-a", asset.id as string)
    expect(detail.usage).toEqual([{ slotId: "home/hero-0/background", pageSlug: "home", pageTitle: "Home", sectionType: "HERO", slotKey: "background" }])
    expect(detail.warnings[0]).toMatch(/over 8 MB/)
  })

  it("updates alt text, caption and the decorative flag", async () => {
    const asset = await readyAsset()
    const res = await MediaService.patch(A, "proj-a", asset.id as string, { altText: "A team", decorative: true })
    expect(res).toMatchObject({ altText: "A team", decorative: true, needsAlt: false })
  })
})

describe("remove", () => {
  it("refuses with 409 and the usage list while in use, and soft-deletes with force", async () => {
    const asset = await readyAsset()
    m.fake!.versions.push({
      id: "verA",
      snapshot: {
        siteType: "SINGLE_PAGE",
        copyFramework: "AIDA",
        citations: [],
        designSystem: { primaryColor: "#000000", secondaryColor: "#000000", accentColor: "#000000", fontPrimary: "Inter", fontSecondary: "Inter", spacing: "", borderRadius: "md", animationStyle: "" },
        pages: [{ type: "HOME", slug: "home", title: "Home", sections: [{ type: "CTA", index: 0 }] }],
        media: { "home/cta-0/background": { assetId: asset.id } },
      },
    })
    await expect(MediaService.remove(A, "proj-a", asset.id as string, false)).rejects.toMatchObject({
      statusCode: 409,
      code: "MEDIA_IN_USE",
      body: { data: { usage: [expect.objectContaining({ slotId: "home/cta-0/background" })] } },
    })
    expect(asset.deletedAt).toBeNull()
    const res = await MediaService.remove(A, "proj-a", asset.id as string, true)
    expect(res.emptiedSlots).toEqual(["home/cta-0/background"])
    expect(asset.deletedAt).toBeInstanceOf(Date)
  })

  it("soft-deletes unused media directly", async () => {
    const asset = await readyAsset()
    await MediaService.remove(A, "proj-a", asset.id as string, false)
    expect(asset.deletedAt).toBeInstanceOf(Date)
  })
})

describe("retry", () => {
  it("re-enqueues a failed asset at most three times", async () => {
    const asset = await readyAsset({ status: "FAILED", failureReason: "Couldn't read this image" })
    storage.objects.set(asset.originalKey as string, JPEG_HEAD)
    for (let i = 1; i <= 3; i++) {
      await MediaService.retry(A, "proj-a", asset.id as string)
      expect(asset).toMatchObject({ status: "PROCESSING", retryCount: i })
      asset.status = "FAILED"
    }
    await expect(MediaService.retry(A, "proj-a", asset.id as string)).rejects.toMatchObject({ code: "MEDIA_RETRY_LIMIT" })
    expect(m.add).toHaveBeenCalledTimes(3)
  })

  it("never retries quarantined content or non-failed assets", async () => {
    const flagged = await readyAsset({ status: "FAILED", failureReason: FLAGGED_REASON })
    await expect(MediaService.retry(A, "proj-a", flagged.id as string)).rejects.toMatchObject({ code: "MEDIA_RETRY_LIMIT" })
    const ready = await readyAsset()
    await expect(MediaService.retry(A, "proj-a", ready.id as string)).rejects.toMatchObject({ code: "MEDIA_NOT_FAILED" })
  })
})

describe("quota", () => {
  it("reports usage, counts and the tier's limits", async () => {
    await readyAsset()
    const q = await MediaService.quota(A)
    expect(q).toMatchObject({ tier: "free", used: 1000 + 100 + 9 * 1024 * 1024, limit: TEST_ENV.MEDIA_FREE_TOTAL_BYTES, counts: { images: 1, videos: 0 } })
    m.balance = 3
    expect((await MediaService.quota(A)).tier).toBe("paid")
  })
})

describe("resolveForPreview", () => {
  it("signs every variant of READY, owned, non-deleted assets only", async () => {
    const ok = await readyAsset()
    const deleted = await readyAsset({ deletedAt: new Date() })
    const processing = await readyAsset({ status: "PROCESSING" })
    const res = await MediaService.resolveForPreview(A, "proj-a", [ok.id as string, deleted.id as string, processing.id as string])
    expect(res.map((r) => r.id)).toEqual([ok.id])
    for (const v of res[0]!.variants) expect(v.url).toContain(`/media/${ok.id}/${v.role}?exp=`)
  })
})
