import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import express from "express"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createFakeDb, createFakeStorage, TEST_ENV } from "./media.testkit.js"

const m = vi.hoisted(() => ({ fake: null as ReturnType<typeof createFakeDb> | null }))

vi.mock("@/config/env.js", () => ({ env: TEST_ENV }))
vi.mock("@useframe/db", () => ({
  get prisma() {
    return m.fake!.db
  },
}))
vi.mock("@/lib/redis.js", () => ({ redis: {} }))
vi.mock("@/modules/credits/credits.service.js", () => ({ CreditsService: { getBalance: async () => 0 } }))

const { setMediaStorageForTests } = await import("@/lib/mediaStorage.js")
const { mediaServeRouter, parseRange } = await import("./media.serve.js")
const { signMediaUrl, verifyMediaSignature } = await import("./media.signing.js")

const BODY = Buffer.from("0123456789abcdefghij")
const SHA = "f".repeat(64)
let server: Server
let base = ""
let storage: ReturnType<typeof createFakeStorage>

beforeAll(async () => {
  const app = express()
  app.use("/media", mediaServeRouter)
  server = createServer(app).listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => server.close())

beforeEach(async () => {
  m.fake = createFakeDb()
  storage = createFakeStorage()
  setMediaStorageForTests(storage)
  storage.objects.set("media/p/a1/v/mp4_720.mp4", BODY)
  storage.objects.set("media/p/a1/orig", Buffer.from("original"))
  await m.fake.db.mediaAsset.create({
    data: {
      id: "a1",
      projectId: "p",
      userId: "u",
      kind: "VIDEO",
      originalKey: "media/p/a1/orig",
      originalMime: "video/mp4",
      originalBytes: 8,
      status: "READY",
      variants: [{ role: "mp4_720", key: "media/p/a1/v/mp4_720.mp4", mime: "video/mp4", width: 1280, height: 720, bytes: BODY.length, sha256: SHA }],
    },
  })
})

const url = (signed: string) => signed.replace(TEST_ENV.MEDIA_PUBLIC_BASE_URL, base)

describe("signing", () => {
  it("verifies valid signatures and rejects expired, tampered and orig", () => {
    const now = Date.now()
    const signed = new URL(signMediaUrl("a1", "mp4_720", 600, now))
    const exp = signed.searchParams.get("exp")!
    const sig = signed.searchParams.get("sig")!
    expect(verifyMediaSignature("a1", "mp4_720", exp, sig, now)).toBe(true)
    expect(verifyMediaSignature("a1", "mp4_720", exp, sig, (Number(exp) + 1) * 1000)).toBe(false)
    expect(verifyMediaSignature("a2", "mp4_720", exp, sig, now)).toBe(false)
    expect(verifyMediaSignature("a1", "mp4_1080", exp, sig, now)).toBe(false)
    expect(verifyMediaSignature("a1", "mp4_720", String(Number(exp) + 60), sig, now)).toBe(false)
    expect(verifyMediaSignature("a1", "orig", exp, sig, now)).toBe(false)
    expect(verifyMediaSignature("a1", "mp4_720", exp, "zz", now)).toBe(false)
    expect(() => signMediaUrl("a1", "orig" as never)).toThrow()
  })
})

describe("GET /media/:assetId/:role", () => {
  it("serves the full variant with server-defined headers", async () => {
    const res = await fetch(url(signMediaUrl("a1", "mp4_720")), { headers: { origin: "https://app.useframe.in" } })
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer())).toEqual(BODY)
    expect(res.headers.get("content-type")).toBe("video/mp4")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin")
    expect(res.headers.get("access-control-allow-origin")).toBe("https://app.useframe.in")
    expect(res.headers.get("vary")).toBe("Origin")
    expect(res.headers.get("cache-control")).toBe("private, max-age=300")
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(res.headers.get("etag")).toBe(`"${SHA}"`)
  })

  it("does not echo origins outside the allow-list", async () => {
    const res = await fetch(url(signMediaUrl("a1", "mp4_720")), { headers: { origin: "https://evil.example" } })
    expect(res.headers.get("access-control-allow-origin")).toBeNull()
    await res.arrayBuffer()
  })

  it("answers 206 for a middle range and an open-ended range", async () => {
    const middle = await fetch(url(signMediaUrl("a1", "mp4_720")), { headers: { range: "bytes=2-5" } })
    expect(middle.status).toBe(206)
    expect(middle.headers.get("content-range")).toBe(`bytes 2-5/${BODY.length}`)
    expect(middle.headers.get("content-length")).toBe("4")
    expect(await middle.text()).toBe("2345")

    const open = await fetch(url(signMediaUrl("a1", "mp4_720")), { headers: { range: "bytes=15-" } })
    expect(open.status).toBe(206)
    expect(await open.text()).toBe("fghij")

    const suffix = await fetch(url(signMediaUrl("a1", "mp4_720")), { headers: { range: "bytes=-3" } })
    expect(await suffix.text()).toBe("hij")
  })

  it("answers 416 for an unsatisfiable range", async () => {
    const res = await fetch(url(signMediaUrl("a1", "mp4_720")), { headers: { range: "bytes=50-60" } })
    expect(res.status).toBe(416)
    expect(res.headers.get("content-range")).toBe(`bytes */${BODY.length}`)
    await res.arrayBuffer()
  })

  it("supports HEAD and If-None-Match", async () => {
    const head = await fetch(url(signMediaUrl("a1", "mp4_720")), { method: "HEAD" })
    expect(head.status).toBe(200)
    expect(head.headers.get("content-length")).toBe(String(BODY.length))
    expect(await head.text()).toBe("")

    const cached = await fetch(url(signMediaUrl("a1", "mp4_720")), { headers: { "if-none-match": `W/"${SHA}"` } })
    expect(cached.status).toBe(304)
  })

  it("rejects missing, expired and tampered signatures, and never serves orig", async () => {
    expect((await fetch(`${base}/media/a1/mp4_720`)).status).toBe(403)
    const signed = new URL(url(signMediaUrl("a1", "mp4_720")))
    signed.searchParams.set("sig", "0".repeat(64))
    expect((await fetch(signed)).status).toBe(403)
    const expired = new URL(url(signMediaUrl("a1", "mp4_720", 60, Date.now() - 3_600_000)))
    expect((await fetch(expired)).status).toBe(403)
    const orig = new URL(url(signMediaUrl("a1", "mp4_720")))
    orig.pathname = "/media/a1/orig"
    expect((await fetch(orig)).status).toBe(403)
  })

  it("answers 404 for deleted assets and unknown variants", async () => {
    m.fake!.assets[0]!.deletedAt = new Date()
    expect((await fetch(url(signMediaUrl("a1", "mp4_720")))).status).toBe(404)
    m.fake!.assets[0]!.deletedAt = null
    expect((await fetch(url(signMediaUrl("a1", "mp4_1080")))).status).toBe(404)
  })
})

describe("parseRange", () => {
  it("handles the single-range forms", () => {
    expect(parseRange(undefined, 10)).toBeNull()
    expect(parseRange("bytes=0-", 10)).toEqual({ start: 0, end: 9 })
    expect(parseRange("bytes=8-100", 10)).toEqual({ start: 8, end: 9 })
    expect(parseRange("bytes=-20", 10)).toEqual({ start: 0, end: 9 })
    expect(parseRange("bytes=5-2", 10)).toBe("unsatisfiable")
    expect(parseRange("bytes=0-1,4-5", 10)).toBe("unsatisfiable")
    expect(parseRange("items=0-1", 10)).toBe("unsatisfiable")
  })
})
