import { readdir } from "node:fs/promises"
import { Readable } from "node:stream"
import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"
import { createAssetFromBytes } from "@/createAsset.js"
import { FLAGGED_REASON } from "@/deps.js"
import { runMediaGc } from "@/jobs/gc.js"
import { processAsset } from "@/jobs/process.js"
import { createOrchestratorDescriber } from "@/processing/describe.js"
import { MediaRejectedError } from "@/processing/errors.js"
import { createDeps } from "./fakes.js"

const once = { attemptsMade: 0, attempts: 3 }
const last = { attemptsMade: 2, attempts: 3 }

const jpeg = () =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: "#3366aa" } })
    .jpeg()
    .toBuffer()

async function setup(body?: Buffer, row: Record<string, unknown> = {}) {
  const ctx = await createDeps()
  const asset = await ctx.fake.db.mediaAsset.create({
    data: {
      projectId: "p1",
      userId: "u1",
      kind: "IMAGE",
      status: "PROCESSING",
      originalKey: "media/p1/asset1/orig",
      originalMime: "image/jpeg",
      originalBytes: body?.length ?? 0,
      ...row,
    },
  } as never)
  if (body) ctx.store.objects.set("media/p1/asset1/orig", body)
  return { ...ctx, asset: asset as unknown as Record<string, unknown> }
}

const described = {
  description: "A blue product shot",
  altText: "Blue product",
  suggestedPurposes: ["hero_visual" as const],
  flagged: false,
}

describe("processAsset", () => {
  it("turns an uploaded image READY with stored variants, hashes and a description", async () => {
    const body = await jpeg()
    const ctx = await setup(body)
    ctx.fake.balances.set("u1", 4)
    const describeFn = vi.fn().mockResolvedValue(described)
    ctx.deps.describe = describeFn
    await processAsset(ctx.deps, { assetId: "asset1" }, once)

    expect(ctx.asset).toMatchObject({
      status: "READY",
      width: 1200,
      height: 800,
      description: "A blue product shot",
      altText: "Blue product",
      suggestedPurposes: ["hero_visual"],
      failureReason: null,
    })
    expect(ctx.asset.sha256).toMatch(/^[0-9a-f]{64}$/)
    const variants = ctx.asset.variants as { role: string; key: string }[]
    expect(variants.map((v) => v.key)).toEqual([
      "media/p1/asset1/v/w480.webp",
      "media/p1/asset1/v/w960.webp",
      "media/p1/asset1/v/fallback.jpg",
      "media/p1/asset1/v/thumb.webp",
    ])
    for (const v of variants) expect(ctx.store.objects.has(v.key)).toBe(true)
    expect(ctx.store.objects.has("media/p1/asset1/orig")).toBe(true)
    expect(describeFn).toHaveBeenCalledWith(expect.objectContaining({ tier: "paid", assetId: "asset1" }))
    expect(await readdir(ctx.workDir)).toEqual([])
  })

  it("keeps the user's own alt text over the suggestion", async () => {
    const ctx = await setup(await jpeg(), { altText: "Mine" })
    ctx.deps.describe = vi.fn().mockResolvedValue(described)
    await processAsset(ctx.deps, { assetId: "asset1" }, once)
    expect(ctx.asset.altText).toBe("Mine")
  })

  it("becomes READY without a description when describing fails, and skips it when asked", async () => {
    const ctx = await setup(await jpeg())
    ctx.deps.describe = vi.fn().mockResolvedValue(null)
    await processAsset(ctx.deps, { assetId: "asset1" }, once)
    expect(ctx.asset).toMatchObject({ status: "READY" })
    expect(ctx.asset.description).toBeUndefined()

    const skip = await setup(await jpeg())
    skip.deps.describe = vi.fn()
    await processAsset(skip.deps, { assetId: "asset1", options: { skipDescribe: true } }, once)
    expect(skip.deps.describe).not.toHaveBeenCalled()
    expect(skip.asset.status).toBe("READY")
  })

  it("quarantines flagged content: FAILED, kept for review, logged by id only", async () => {
    const ctx = await setup(await jpeg())
    ctx.deps.describe = vi.fn().mockResolvedValue({ ...described, flagged: true, flagReason: "details" })
    await processAsset(ctx.deps, { assetId: "asset1" }, once)
    expect(ctx.asset).toMatchObject({ status: "FAILED", failureReason: FLAGGED_REASON })
    expect(ctx.asset.description).toBeUndefined()
    expect(ctx.store.objects.has("media/p1/asset1/orig")).toBe(true)
    expect(ctx.fake.logs).toEqual([
      { projectId: "p1", jobId: "media-flag-asset1", stage: "FAILED", status: "MEDIA_FLAGGED" },
    ])
  })

  it("rejects an original whose bytes are not its declared type, deleting it", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')
    const ctx = await setup(svg, { originalMime: "image/png" })
    await processAsset(ctx.deps, { assetId: "asset1" }, once)
    expect(ctx.asset).toMatchObject({ status: "FAILED", failureReason: "The file's contents don't match its type" })
    expect(ctx.store.objects.size).toBe(0)
  })

  it("rejects an original over the size ceiling without retrying", async () => {
    const ctx = await setup(await jpeg())
    ctx.deps.config.maxImageBytes = 100
    await processAsset(ctx.deps, { assetId: "asset1" }, once)
    expect(ctx.asset).toMatchObject({ status: "FAILED", failureReason: "The file is larger than allowed" })
  })

  it("retries transient storage errors and only fails on the last attempt", async () => {
    const ctx = await setup(await jpeg())
    ctx.store.failUploads = 100
    await expect(processAsset(ctx.deps, { assetId: "asset1" }, once)).rejects.toThrow("Service Unavailable")
    expect(ctx.asset.status).toBe("PROCESSING")
    await expect(processAsset(ctx.deps, { assetId: "asset1" }, last)).rejects.toThrow("Service Unavailable")
    expect(ctx.asset).toMatchObject({
      status: "FAILED",
      failureReason: "We couldn't process this file. Please try again.",
    })
    expect(ctx.store.objects.has("media/p1/asset1/orig")).toBe(true)
  })

  it("recovers from a single transient upload failure", async () => {
    const ctx = await setup(await jpeg())
    ctx.store.failUploads = 1
    await processAsset(ctx.deps, { assetId: "asset1" }, once)
    expect(ctx.asset.status).toBe("READY")
  })

  it("skips assets that are no longer PROCESSING or were deleted, and cleans up after a racing delete", async () => {
    const ready = await setup(await jpeg(), { status: "READY" })
    await processAsset(ready.deps, { assetId: "asset1" }, once)
    expect(ready.store.objects.size).toBe(1)

    const racing = await setup(await jpeg())
    racing.deps.describe = vi.fn().mockImplementation(async () => {
      racing.asset.deletedAt = new Date()
      return described
    })
    await processAsset(racing.deps, { assetId: "asset1" }, once)
    expect(racing.asset.status).toBe("PROCESSING")
    expect([...racing.store.objects.keys()]).toEqual(["media/p1/asset1/orig"])
  })
})

describe("runMediaGc", () => {
  it("removes abandoned uploads after an hour and purges soft-deleted media after 30 days", async () => {
    const ctx = await createDeps()
    const now = new Date("2026-10-09T12:00:00Z")
    const make = async (id: string, row: Record<string, unknown>) => {
      await ctx.fake.db.mediaAsset.create({ data: { id, projectId: "p1", status: "READY", ...row } } as never)
      ctx.store.objects.set(`media/p1/${id}/orig`, Buffer.from("x"))
      ctx.store.objects.set(`media/p1/${id}/v/thumb.webp`, Buffer.from("x"))
    }
    await make("stale", { status: "UPLOADING", createdAt: new Date(now.getTime() - 2 * 3600_000) })
    await make("fresh", { status: "UPLOADING", createdAt: new Date(now.getTime() - 10 * 60_000) })
    await make("old", { deletedAt: new Date(now.getTime() - 31 * 86400_000) })
    await make("recent", { deletedAt: new Date(now.getTime() - 5 * 86400_000) })
    expect(await runMediaGc(ctx.deps, now)).toEqual({ abandoned: 1, purged: 1 })
    expect(ctx.fake.assets.map((a) => a.id).sort()).toEqual(["fresh", "recent"])
    expect([...ctx.store.objects.keys()].some((k) => k.includes("stale") || k.includes("/old/"))).toBe(false)
  })
})

describe("createAssetFromBytes", () => {
  it("stores the original, creates a PROCESSING row and enqueues with options", async () => {
    const ctx = await createDeps()
    const bytes = await jpeg()
    const { assetId } = await createAssetFromBytes(ctx.deps, {
      projectId: "p1",
      userId: "u1",
      kind: "IMAGE",
      origin: "GENERATED",
      mime: "image/jpeg",
      purpose: "hero_visual",
      generation: { jobId: "j1" },
      options: { skipDescribe: true },
      bytes,
    })
    expect(ctx.fake.assets[0]).toMatchObject({
      id: assetId,
      status: "PROCESSING",
      origin: "GENERATED",
      aiGenerated: true,
      purpose: "hero_visual",
      originalKey: `media/p1/${assetId}/orig`,
      originalBytes: bytes.length,
    })
    expect(ctx.store.objects.get(`media/p1/${assetId}/orig`)).toEqual(bytes)
    expect(ctx.enqueued).toEqual([{ payload: { assetId, options: { skipDescribe: true } }, jobId: `${assetId}-0` }])
  })

  it("accepts a stream and still checks the magic bytes", async () => {
    const ctx = await createDeps()
    const bytes = await jpeg()
    const { assetId } = await createAssetFromBytes(ctx.deps, {
      projectId: "p1",
      userId: "u1",
      kind: "IMAGE",
      origin: "GENERATED",
      mime: "image/jpeg",
      stream: Readable.from([bytes.subarray(0, 10), bytes.subarray(10)]),
      size: bytes.length,
    })
    expect(ctx.store.objects.get(`media/p1/${assetId}/orig`)).toEqual(bytes)
    await expect(
      createAssetFromBytes(ctx.deps, {
        projectId: "p1",
        userId: "u1",
        kind: "IMAGE",
        origin: "GENERATED",
        mime: "image/png",
        bytes,
      }),
    ).rejects.toBeInstanceOf(MediaRejectedError)
  })

  it("applies size and type limits but not user quota", async () => {
    const ctx = await createDeps()
    ctx.deps.config.maxImageBytes = 10
    await expect(
      createAssetFromBytes(ctx.deps, {
        projectId: "p1",
        userId: "u1",
        kind: "IMAGE",
        origin: "GENERATED",
        mime: "image/jpeg",
        bytes: await jpeg(),
      }),
    ).rejects.toMatchObject({ publicReason: "The file is larger than allowed" })
    await expect(
      createAssetFromBytes(ctx.deps, {
        projectId: "p1",
        userId: "u1",
        kind: "IMAGE",
        origin: "GENERATED",
        mime: "image/gif",
        bytes: Buffer.from("GIF89a"),
      }),
    ).rejects.toBeInstanceOf(MediaRejectedError)
    expect(ctx.fake.assets).toHaveLength(0)
  })
})

describe("orchestrator describer", () => {
  it("sends only pixels and tier, and retries once on a malformed answer", async () => {
    const ctx = await setup(await jpeg())
    const file = `${ctx.workDir}/img.webp`
    const { writeFile } = await import("node:fs/promises")
    await writeFile(
      file,
      await sharp(await jpeg())
        .webp()
        .toBuffer(),
    )
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false }), { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: described }), { status: 200 }))
    const describeFn = createOrchestratorDescriber({
      url: "http://orch.test",
      secret: "s".repeat(16),
      timeoutMs: 1000,
      fetchImpl,
    })
    expect(await describeFn({ imagePath: file, tier: "free", assetId: "asset1" })).toEqual(described)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [url, init] = fetchImpl.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe("http://orch.test/internal/media/describe")
    expect(Object.keys(JSON.parse(init.body as string)).sort()).toEqual(["image", "mime", "tier"])
    expect((init.headers as Record<string, string>)["x-internal-secret"]).toBe("s".repeat(16))
  })

  it("gives up after two failures", async () => {
    const ctx = await setup()
    const file = `${ctx.workDir}/img.webp`
    const { writeFile } = await import("node:fs/promises")
    await writeFile(file, Buffer.from("x"))
    const fetchImpl = vi.fn().mockRejectedValue(new Error("down"))
    const describeFn = createOrchestratorDescriber({
      url: "http://orch.test",
      secret: "s".repeat(16),
      timeoutMs: 1000,
      fetchImpl,
    })
    expect(await describeFn({ imagePath: file, tier: "paid", assetId: "asset1" })).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
