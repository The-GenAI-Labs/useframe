import { prisma, type Prisma } from "@useframe/db"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { AutoReloadJobPayload } from "@repo/events"
import { redis } from "@/lib/redis.js"
import { AppError } from "@/middleware/errorHandler.js"

const autoReloadQueue = new Queue<AutoReloadJobPayload>(QUEUES.AUTO_RELOAD, { connection: redis })

export const CreditsService = {
  async getBalance(userId: string): Promise<number> {
    const balance = await prisma.creditBalance.findUnique({
      where: { userId },
      select: { balance: true },
    })
    return balance?.balance ?? 0
  },

  async hasSufficientBalance(userId: string, amount: number): Promise<boolean> {
    const balance = await this.getBalance(userId)
    return balance >= amount
  },

  async deduct(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    reason: string,
    refId?: string
  ): Promise<{ balanceAfter: number; autoReloadTopUpCents: number | null }> {
    const result = await tx.creditBalance.updateMany({
      where: { userId, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    })

    if (result.count === 0) {
      throw new AppError("Insufficient credits", 402)
    }

    const updated = await tx.creditBalance.findUniqueOrThrow({
      where: { userId },
      select: { balance: true },
    })

    await tx.creditTransaction.create({
      data: {
        userId,
        delta: -amount,
        type: "SPEND",
        reason,
        balanceAfter: updated.balance,
        refId,
      },
    })

    const autoReload = await tx.autoReloadSetting.findUnique({ where: { userId } })
    const crossedThreshold =
      !!autoReload?.enabled && updated.balance * 50 < autoReload.thresholdCents

    return {
      balanceAfter: updated.balance,
      autoReloadTopUpCents: crossedThreshold ? autoReload!.topUpToCents : null,
    }
  },

  // Call once the transaction containing deduct() has committed, passing its
  // autoReloadTopUpCents through — keeps the BullMQ enqueue outside the DB
  // transaction so a rollback can never cause a phantom off-session charge.
  async triggerAutoReload(userId: string, topUpToCents: number): Promise<void> {
    await autoReloadQueue.add("autoReload", { userId, topUpToCents })
  },
}
