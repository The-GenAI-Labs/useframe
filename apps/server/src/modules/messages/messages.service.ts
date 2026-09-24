import { prisma, type Prisma } from "@useframe/db"
import type { SiteSpec } from "@repo/schemas"
import { AppError } from "@/middleware/errorHandler.js"
import { signAccessToken } from "@/lib/jwt.js"
import { callIterate } from "@/lib/orchestrator.js"
import { CreditsService } from "@/modules/credits/credits.service.js"
import { recordUserEdit } from "@/lib/generationOutcome.js"
import type { SendMessageInput } from "./messages.schema.js"

const MIN_ITERATION_COST = 1

export const MessagesService = {
  async sendMessage(
    user: { id: string; email: string; plan: string },
    slug: string,
    input: SendMessageInput
  ) {
    const project = await prisma.project.findFirst({
      where: { slug, userId: user.id, deletedAt: null },
    })
    if (!project) throw new AppError("Project not found", 404)

    if (project.status === "GENERATING") {
      throw new AppError(
        "A generation is already in progress for this project",
        409
      )
    }

    let conversation
    if (input.conversationId) {
      conversation = await prisma.conversation.findFirst({
        where: { id: input.conversationId, userId: user.id, projectId: project.id },
      })
      if (!conversation) throw new AppError("Conversation not found", 404)
    } else {
      conversation = await prisma.conversation.create({
        data: { userId: user.id, projectId: project.id },
      })
    }

    const version = await prisma.projectVersion.findFirst({
      where: { id: input.versionId, projectId: project.id },
    })
    if (!version) throw new AppError("Version not found", 404)

    const hasCredits = await CreditsService.hasSufficientBalance(
      user.id,
      MIN_ITERATION_COST
    )
    if (!hasCredits) throw new AppError("Insufficient credits", 402)

    const userMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "USER",
        content: input.content,
      },
    })

    const internalToken = signAccessToken({
      id: user.id,
      email: user.email,
      plan: user.plan,
    })

    let iterateResult
    try {
      iterateResult = await callIterate(
        {
          projectId: project.id,
          versionId: version.id,
          instruction: input.content,
          currentSpec: version.snapshot as unknown as SiteSpec,
        },
        internalToken
      )
    } catch (err) {
      const message = err instanceof AppError ? err.message : "Failed to process instruction"
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: `Sorry, something went wrong: ${message}`,
        },
      })
      if (err instanceof AppError) throw err
      throw new AppError("Failed to process instruction", 502)
    }

    if (!iterateResult.changed) {
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: iterateResult.summary,
        },
      })
      return {
        message: assistantMessage,
        newVersion: null,
        changed: false,
        conversationId: conversation.id,
      }
    }

    const isFreeReplicationCorrection =
      !!project.replicationSourceUrl && !project.replicationFreeCorrectionUsed
    const creditCost = isFreeReplicationCorrection
      ? 0
      : iterateResult.editSize === "major" ? 2 : 1

    try {
      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.project.update({
          where: { id: project.id },
          data: {
            status: "GENERATING",
            ...(isFreeReplicationCorrection ? { replicationFreeCorrectionUsed: true } : {}),
          },
        })

        const { autoReloadTopUpCents } = creditCost > 0
          ? await CreditsService.deduct(tx, user.id, creditCost, "Iteration edit", undefined)
          : { autoReloadTopUpCents: null }

        const latest = await tx.projectVersion.findFirst({
          where: { projectId: project.id },
          orderBy: { versionNumber: "desc" },
          select: { versionNumber: true },
        })

        const newVersion = await tx.projectVersion.create({
          data: {
            projectId: project.id,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            siteType: version.siteType,
            seo: version.seo as Prisma.InputJsonValue,
            parentVersionId: version.id,
            snapshot: iterateResult.updatedSpec as unknown as object,
          },
        })

        await tx.project.update({
          where: { id: project.id },
          data: { currentVersionId: newVersion.id, status: "READY" },
        })

        const assistantMessage = await tx.message.create({
          data: {
            conversationId: conversation.id,
            role: "ASSISTANT",
            content: iterateResult.summary,
            producedVersionId: newVersion.id,
          },
        })

        await tx.projectVersion.update({
          where: { id: newVersion.id },
          data: { createdByMessageId: assistantMessage.id },
        })

        return { assistantMessage, newVersion, autoReloadTopUpCents }
      })

      if (result.autoReloadTopUpCents !== null) {
        await CreditsService.triggerAutoReload(user.id, result.autoReloadTopUpCents)
      }

      // Capture design-relevant drift from the approved brief for later
      // outcome analysis — deliberately narrow to the fields that matter for
      // that analysis (Stage 3 explicitly defers aggregation/insight work,
      // this just needs to record edits correctly as they happen).
      const oldSpec = version.snapshot as unknown as SiteSpec
      const newSpec = iterateResult.updatedSpec
      const oldDesign = oldSpec.designSystem
      const newDesign = newSpec.designSystem
      if (oldDesign && newDesign) {
        if (oldDesign.primaryColor !== newDesign.primaryColor) {
          await recordUserEdit(
            project.id,
            "designSystem.primaryColor",
            oldDesign.primaryColor,
            newDesign.primaryColor,
            input.content
          )
        }
        if (oldDesign.fontPrimary !== newDesign.fontPrimary) {
          await recordUserEdit(
            project.id,
            "designSystem.fontPrimary",
            oldDesign.fontPrimary,
            newDesign.fontPrimary,
            input.content
          )
        }
      }
      const oldSections = oldSpec.pages?.[0]?.sections.map((s) => s.type) ?? []
      const newSections = newSpec.pages?.[0]?.sections.map((s) => s.type) ?? []
      if (JSON.stringify(oldSections) !== JSON.stringify(newSections)) {
        await recordUserEdit(
          result.newVersion.id,
          "pages[0].sections",
          oldSections,
          newSections,
          input.content
        )
      }

      return {
        message: result.assistantMessage,
        newVersion: {
          id: result.newVersion.id,
          versionNumber: result.newVersion.versionNumber,
        },
        changed: true,
        conversationId: conversation.id,
      }
    } catch (err) {
      await prisma.project
        .update({ where: { id: project.id }, data: { status: "FAILED" } })
        .catch(() => {})
      throw err
    }
  },
}
