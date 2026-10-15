import type { Prisma } from "@useframe/db"
import { refundUnspent } from "@repo/media-ai"
import { log, metric } from "@/lib/logger.js"
import type { GenerateDb } from "./deps.js"

const IDLE_MS = 30 * 60 * 1000

// Expired approvals cancel the job (the site keeps building without generated
// media); runs that stopped making progress fail. Both refund what was not spent.
export async function sweepMediaJobs(db: GenerateDb, now = new Date()): Promise<{ expired: number; reaped: number }> {
  const expired = await db.mediaJob.findMany({
    where: { status: "AWAITING_USER", checkpointExpiresAt: { lt: now } },
    select: { id: true, userId: true, state: true },
    take: 100,
  })
  for (const job of expired) {
    const claimed = await db.mediaJob.updateMany({ where: { id: job.id, status: "AWAITING_USER" }, data: { status: "CANCELLED" } })
    if (claimed.count === 0) continue
    const state = await refundUnspent(db, job, "AI media approval expired")
    await db.mediaJob.update({
      where: { id: job.id },
      data: { state: state as unknown as Prisma.InputJsonValue, checkpoint: null, failureReason: "The approval window expired", finishedAt: now },
    })
  }

  const stuck = await db.mediaJob.findMany({
    where: { status: { in: ["RUNNING", "QUEUED"] }, updatedAt: { lt: new Date(now.getTime() - IDLE_MS) } },
    select: { id: true, userId: true, state: true },
    take: 100,
  })
  for (const job of stuck) {
    const claimed = await db.mediaJob.updateMany({ where: { id: job.id, status: { in: ["RUNNING", "QUEUED"] }, updatedAt: { lt: new Date(now.getTime() - IDLE_MS) } }, data: { status: "FAILED" } })
    if (claimed.count === 0) continue
    const state = await refundUnspent(db, job, "AI media job stopped")
    await db.mediaJob.update({
      where: { id: job.id },
      data: { state: state as unknown as Prisma.InputJsonValue, failureReason: "AI media stopped responding and was refunded", finishedAt: now },
    })
  }
  if (expired.length || stuck.length) log.info("media jobs swept", { expired: expired.length, reaped: stuck.length })
  metric("media.jobs_swept", expired.length + stuck.length, { expired: expired.length, reaped: stuck.length })
  return { expired: expired.length, reaped: stuck.length }
}
