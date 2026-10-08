import { Worker, Queue } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import { redis } from "../lib/redis.js"
import { env } from "../config/env.js"

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

async function expireCache(): Promise<void> {
  await prisma.competitorScan.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  await prisma.scoreResult.deleteMany({ where: { expiresAt: { lt: new Date() }, status: "DONE" } })
  await prisma.searchQueryCache.deleteMany({ where: { expiresAt: { lt: new Date() } } })

  const draftCutoff = new Date(Date.now() - env.BRIEF_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000)
  const drafts = await prisma.projectBrief.deleteMany({
    where: { projectId: null, status: "DRAFT", updatedAt: { lt: draftCutoff } },
  })
  const uploads = await prisma.briefUpload.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  if (drafts.count || uploads.count) {
    console.log(`[expireCache] Removed ${drafts.count} stale brief drafts, ${uploads.count} expired brief uploads`)
  }
}

export function startExpireCacheWorker(): Worker {
  const worker = new Worker(QUEUES.EXPIRE_CACHE, async () => { await expireCache() }, { connection: redis })

  worker.on("completed", () => console.log("[expireCache] Cleanup completed"))
  worker.on("failed", (job, err) => console.error("[expireCache] Failed:", err.message))

  // Self-contained daily scheduler registration — runs once at worker
  // startup (upsertJobScheduler is idempotent, so this is safe to call every
  // time the worker boots, matching the domains.service.ts precedent but
  // registered once globally here rather than per-row).
  const expireCacheQueue = new Queue(QUEUES.EXPIRE_CACHE, { connection: redis })
  void expireCacheQueue
    .upsertJobScheduler("expire-cache-daily", { every: CLEANUP_INTERVAL_MS }, { data: {} })
    .catch((err) => console.error("[expireCache] Failed to schedule daily cleanup:", err))

  return worker
}
