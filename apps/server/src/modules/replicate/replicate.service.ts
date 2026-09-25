import { prisma, type Prisma } from "@useframe/db"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { ScanJobPayload } from "@repo/events"
import { redis } from "@/lib/redis.js"
import { uniqueSlug } from "@/lib/slug.js"
import { AppError } from "@/middleware/errorHandler.js"
import { CreditsService } from "@/modules/credits/credits.service.js"
import { GENERATE_CREDIT_COST } from "@/modules/generate/generate.service.js"
import type { ReplicateRequestInput } from "./replicate.schema.js"

const scanQueue = new Queue(QUEUES.SCAN, { connection: redis })

export const FREE_REPLICATION_USED_MESSAGE =
  "You've used your free replication. Upgrade to keep building."

export const ReplicateService = {
  async replicate(userId: string, input: ReplicateRequestInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { freeReplicationUsed: true },
    })
    if (!user) throw new AppError("User not found", 404)

    const balance = await prisma.creditBalance.findUnique({ where: { userId } })
    const isFreeTier = !balance || balance.balance <= 0

    if (isFreeTier && user.freeReplicationUsed) {
      throw new AppError(FREE_REPLICATION_USED_MESSAGE, 403, "FREE_REPLICATION_USED")
    }
    if (!isFreeTier) {
      const hasBalance = await CreditsService.hasSufficientBalance(userId, GENERATE_CREDIT_COST)
      if (!hasBalance) throw new AppError("Insufficient credits", 402)
    }

    const tier = isFreeTier ? "free" : "paid"
    const slug = uniqueSlug(new URL(input.url).hostname)

    const { replication, autoReloadTopUpCents } = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        if (isFreeTier) {
          const updated = await tx.user.updateMany({
            where: { id: userId, freeReplicationUsed: false },
            data: { freeReplicationUsed: true, freeReplicationUsedAt: new Date() },
          })
          if (updated.count === 0) {
            throw new AppError(FREE_REPLICATION_USED_MESSAGE, 403, "FREE_REPLICATION_USED")
          }
        }

        let autoReloadTopUpCents: number | null = null
        if (!isFreeTier) {
          const result = await CreditsService.deduct(tx, userId, GENERATE_CREDIT_COST, "Replication", undefined)
          autoReloadTopUpCents = result.autoReloadTopUpCents
        }

        const replication = await tx.replication.create({
          data: {
            userId,
            slug,
            sourceUrl: input.url,
            status: "QUEUED",
            tier: tier === "free" ? "FREE" : "PAID",
          },
        })

        return { replication, autoReloadTopUpCents }
      }
    )

    if (autoReloadTopUpCents !== null) {
      await CreditsService.triggerAutoReload(userId, autoReloadTopUpCents)
    }

    const payload: ScanJobPayload = {
      scanId: replication.id,
      userId,
      replicationId: replication.id,
      sourceUrl: input.url,
      scanType: "REPLICATION_TARGET",
      mode: "DEEP",
      tier,
    }

    await scanQueue.add("scan", payload, {
      attempts: 2,
      backoff: { type: "exponential", delay: 5000 },
    })

    return { replicationId: replication.id, slug: replication.slug, status: "QUEUED", tier }
  },

  async list(userId: string) {
    return prisma.replication.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        slug: true,
        sourceUrl: true,
        status: true,
        tier: true,
        createdAt: true,
      },
    })
  },

  async getBySlug(userId: string, slug: string) {
    const replication = await prisma.replication.findFirst({
      where: { slug, userId },
    })
    if (!replication) throw new AppError("Replication not found", 404)
    return replication
  },
}
