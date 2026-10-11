import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import express, { type NextFunction, type Response } from "express"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { AuthenticatedRequest } from "@/types/index.js"
import { TEST_ENV } from "./media.testkit.js"

const m = vi.hoisted(() => ({ counts: new Map<string, number>(), startUpload: vi.fn(), remove: vi.fn() }))

vi.mock("@/config/env.js", () => ({ env: TEST_ENV }))
vi.mock("@/lib/redis.js", () => ({
  redis: {
    incr: async (key: string) => {
      const next = (m.counts.get(key) ?? 0) + 1
      m.counts.set(key, next)
      return next
    },
    expire: async () => 1,
    ttl: async () => 100,
  },
}))
vi.mock("@/middleware/authenticate.js", () => ({
  authenticate: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.user = { id: String(req.headers["x-test-user"] ?? "u1"), email: "a@b.c", plan: "free" }
    next()
  },
}))
vi.mock("./media.service.js", () => ({
  MediaService: { startUpload: m.startUpload, remove: m.remove },
}))

const { default: mediaRoutes } = await import("./media.routes.js")
const { errorHandler } = await import("@/middleware/errorHandler.js")

let server: Server
let base = ""

beforeAll(() => {
  const app = express()
  app.use(express.json())
  app.use("/api/projects/:slug/media", mediaRoutes)
  app.use(errorHandler)
  server = createServer(app).listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/projects/proj-a/media`
})

afterAll(() => server.close())

beforeEach(() => {
  m.counts.clear()
  m.startUpload.mockReset().mockResolvedValue({ assetId: "a1" })
  m.remove.mockReset().mockResolvedValue({ id: "a1", deleted: true })
})

const post = (body: unknown, user = "u1") =>
  fetch(`${base}/uploads`, { method: "POST", headers: { "content-type": "application/json", "x-test-user": user }, body: JSON.stringify(body) })

describe("media routes", () => {
  it("validates the upload body before calling the service", async () => {
    const res = await post({ filename: "", mime: "image/jpeg", bytes: -1 })
    expect(res.status).toBe(422)
    expect(m.startUpload).not.toHaveBeenCalled()
  })

  it("passes the authenticated user and slug, never a body-supplied user", async () => {
    const res = await post({ filename: "a.jpg", mime: "image/jpeg", bytes: 10, userId: "someone-else" })
    expect(res.status).toBe(201)
    expect(m.startUpload).toHaveBeenCalledWith("u1", "proj-a", { filename: "a.jpg", mime: "image/jpeg", bytes: 10 })
  })

  it("limits upload starts to 60 per user per hour", async () => {
    for (let i = 0; i < 60; i++) expect((await post({ filename: "a.jpg", mime: "image/jpeg", bytes: 10 })).status).toBe(201)
    const limited = await post({ filename: "a.jpg", mime: "image/jpeg", bytes: 10 })
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("100")
    expect((await post({ filename: "a.jpg", mime: "image/jpeg", bytes: 10 }, "u2")).status).toBe(201)
  })

  it("passes force only when it is exactly true", async () => {
    await fetch(`${base}/a1?force=true`, { method: "DELETE" })
    await fetch(`${base}/a1?force=1`, { method: "DELETE" })
    expect(m.remove.mock.calls.map((c) => c[3])).toEqual([true, false])
  })
})
