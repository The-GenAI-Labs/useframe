import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadMediaAiConfig } from "@repo/media-ai"
import { TEST_ENV } from "../media/media.testkit.js"
import { createMemoryDb } from "@repo/media-ai/testing"

const m = vi.hoisted(() => ({ db: null as ReturnType<typeof createMemoryDb> | null, add: vi.fn() }))

vi.mock("@/config/env.js", () => ({ env: TEST_ENV, mediaAiConfig: loadMediaAiConfig({ MEDIA_ENABLED: "true" }) }))
vi.mock("@useframe/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@useframe/db")>()),
  get prisma() {
    return m.db!
  },
  briefStateOf: () => ({ data: {} }),
}))
vi.mock("@/lib/redis.js", () => ({ redis: {} }))
vi.mock("bullmq", () => ({ Queue: class { add = m.add } }))

const { MediaJobsService } = await import("./mediaJobs.service.js")

const A = "userA"
const B = "userB"
const PAGES = [{ type: "HOME", slug: "home", title: "Home", sections: [{ type: "HERO", index: 0, content: { headline: "Hi" } }] }]

async function seed(balanceA: number) {
  const db = m.db!
  await db.project.create({ data: { id: "projA", slug: "proj-a", userId: A, currentVersionId: "verA" } })
  await db.project.create({ data: { id: "projB", slug: "proj-b", userId: B, currentVersionId: null } })
  await db.projectVersion.create({ data: { id: "verA", projectId: "projA", versionNumber: 1, snapshot: { pages: PAGES, copyFramework: "AIDA", media: {} } } })
  await db.creditBalance.create({ data: { userId: A, balance: balanceA } })
  await db.creditBalance.create({ data: { userId: B, balance: 500 } })
}

beforeEach(() => {
  m.db = createMemoryDb()
  m.add.mockReset()
})

describe("MediaJobsService", () => {
  it("is paid-only for estimates and starts", async () => {
    await seed(0)
    await expect(MediaJobsService.estimate(A, "proj-a")).rejects.toMatchObject({ statusCode: 403, code: "PAID_FEATURE" })
    await expect(MediaJobsService.start(A, "proj-a", { mode: "AUTO", scope: { kind: "site" } })).rejects.toMatchObject({ statusCode: 403 })
    await expect(MediaJobsService.accountEstimate(A, "STANDARD")).rejects.toMatchObject({ statusCode: 403 })
  })

  it("starts a job, reserves credits once and enqueues it", async () => {
    await seed(1000)
    const job = await MediaJobsService.start(A, "proj-a", { mode: "AUTO", scope: { kind: "site" } })
    expect(job.status).toBe("QUEUED")
    expect(job.creditsReserved).toBeGreaterThan(0)
    expect(m.add).toHaveBeenCalledTimes(1)
    expect((await m.db!.creditBalance.findUnique({ where: { userId: A } }))!.balance).toBe(1000 - job.creditsReserved)
    expect(JSON.stringify(job)).not.toMatch(/openai|runware|minimax|claude|gpt/i)
    await expect(MediaJobsService.start(A, "proj-a", { mode: "AUTO", scope: { kind: "site" } })).rejects.toMatchObject({ statusCode: 409 })
  })

  it("answers 402 with the shortfall when credits do not cover the run", async () => {
    await seed(3)
    await expect(MediaJobsService.start(A, "proj-a", { mode: "AUTO", scope: { kind: "site" } })).rejects.toMatchObject({
      statusCode: 402,
      code: "INSUFFICIENT_CREDITS",
    })
    expect(m.db!.mediaJob.rows).toHaveLength(0)
    expect((await m.db!.creditBalance.findUnique({ where: { userId: A } }))!.balance).toBe(3)
  })

  it("hides other users' projects and jobs behind 404", async () => {
    await seed(1000)
    const job = await MediaJobsService.start(A, "proj-a", { mode: "AUTO", scope: { kind: "site" } })
    await expect(MediaJobsService.get(B, "proj-a", job.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(MediaJobsService.get(B, "proj-b", job.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(MediaJobsService.checkpoint(B, "proj-b", job.id, { checkpoint: "PLAN_APPROVE", action: "approve" })).rejects.toMatchObject({ statusCode: 404 })
    await expect(MediaJobsService.cancel(B, "proj-b", job.id)).rejects.toMatchObject({ statusCode: 404 })
  })

  it("rejects an answer to a checkpoint that is not open", async () => {
    await seed(1000)
    const job = await MediaJobsService.start(A, "proj-a", { mode: "MANUAL", scope: { kind: "site" } })
    await expect(MediaJobsService.checkpoint(A, "proj-a", job.id, { checkpoint: "PLAN_APPROVE", action: "approve" })).rejects.toMatchObject({
      statusCode: 409,
      code: "MEDIA_CHECKPOINT_STALE",
    })
  })

  it("lets the owner see and cancel a run that used their last credits, refunding it", async () => {
    await seed(1000)
    const started = await MediaJobsService.start(A, "proj-a", { mode: "AUTO", scope: { kind: "site" } })
    await m.db!.creditBalance.update({ where: { userId: A }, data: { balance: 0 } })
    const latest = await MediaJobsService.latest(A, "proj-a")
    expect(latest.job?.id).toBe(started.id)
    const cancelled = await MediaJobsService.cancel(A, "proj-a", started.id)
    expect(cancelled.status).toBe("CANCELLED")
    expect(cancelled.creditsRefunded).toBe(started.creditsReserved)
    await expect(MediaJobsService.cancel(A, "proj-a", started.id)).rejects.toMatchObject({ statusCode: 409 })
  })
})
