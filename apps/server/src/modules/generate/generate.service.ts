import { prisma, type Prisma } from "@useframe/db"
import { AppError } from "@/middleware/errorHandler.js"
import { CreditsService } from "@/modules/credits/credits.service.js"

export const GENERATE_CREDIT_COST = 5

export type AuthorizeResult = { tier: "free" | "paid" }

export const GenerateService = {
  // Pre-flight check-and-reserve called by apps/web BEFORE it opens the SSE
  // connection to orchestrator-service's /generate or /plan. First-ever
  // generation is free (DeepSeek, no credit deduction) — the
  // hasUsedFreeGeneration flag is flipped here as an optimistic reservation
  // the moment we decide to grant the free tier, mirroring how
  // orchestrator.ts's ensureProject() creates the project as a side effect
  // of starting generation rather than waiting for it to finish. Every
  // generation after the first must have sufficient credit balance and pays
  // GENERATE_CREDIT_COST, deducted transactionally exactly like
  // plan.service.ts does for RESEARCH_CREDIT_COST.
  async authorize(userId: string): Promise<AuthorizeResult> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { hasUsedFreeGeneration: true },
    })
    if (!user) throw new AppError("User not found", 404)

    if (!user.hasUsedFreeGeneration) {
      const updated = await prisma.user.updateMany({
        where: { id: userId, hasUsedFreeGeneration: false },
        data: { hasUsedFreeGeneration: true },
      })

      // Someone else's concurrent request already flipped the flag first —
      // treat this request as the paid path rather than double-granting a
      // free generation. Not bulletproof under true concurrency, but a
      // reasonable guard against the obvious double-spend.
      if (updated.count > 0) {
        return { tier: "free" }
      }
    }

    const hasBalance = await CreditsService.hasSufficientBalance(userId, GENERATE_CREDIT_COST)
    if (!hasBalance) {
      throw new AppError("Insufficient credits", 402)
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      return CreditsService.deduct(tx, userId, GENERATE_CREDIT_COST, "Generation", undefined)
    })

    if (result.autoReloadTopUpCents !== null) {
      await CreditsService.triggerAutoReload(userId, result.autoReloadTopUpCents)
    }

    return { tier: "paid" }
  },
}
