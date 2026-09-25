import { prisma, type Prisma } from "@useframe/db"
import type { SiteSpec } from "@repo/schemas"
import { AppError } from "@/middleware/errorHandler.js"
import { signAccessToken } from "@/lib/jwt.js"
import { callIterate } from "@/lib/orchestrator.js"
import { CreditsService } from "@/modules/credits/credits.service.js"
import type { ReplicateMessageInput } from "./replicateMessages.schema.js"

export const ReplicateMessagesService = {
  async sendMessage(
    user: { id: string; email: string; plan: string },
    slug: string,
    input: ReplicateMessageInput
  ) {
    const replication = await prisma.replication.findFirst({
      where: { slug, userId: user.id },
    })
    if (!replication) throw new AppError("Replication not found", 404)
    if (!replication.snapshot) throw new AppError("Preview not ready yet", 409)

    const isFreeCorrection = !replication.freeCorrectionUsed
    if (!isFreeCorrection) {
      const hasCredits = await CreditsService.hasSufficientBalance(user.id, 1)
      if (!hasCredits) throw new AppError("Insufficient credits", 402)
    }

    const internalToken = signAccessToken({ id: user.id, email: user.email, plan: user.plan })

    const iterateResult = await callIterate(
      {
        projectId: replication.id,
        versionId: replication.id,
        instruction: input.content,
        currentSpec: replication.snapshot as unknown as SiteSpec,
      },
      internalToken
    )

    if (!iterateResult.changed) {
      return { snapshot: replication.snapshot, changed: false, summary: iterateResult.summary }
    }

    const creditCost = isFreeCorrection ? 0 : iterateResult.editSize === "major" ? 2 : 1

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (creditCost > 0) {
        await CreditsService.deduct(tx, user.id, creditCost, "Replication iteration", undefined)
      }
      return tx.replication.update({
        where: { id: replication.id },
        data: {
          snapshot: iterateResult.updatedSpec as unknown as object,
          freeCorrectionUsed: true,
        },
      })
    })

    return { snapshot: updated.snapshot, changed: true, summary: iterateResult.summary }
  },
}
