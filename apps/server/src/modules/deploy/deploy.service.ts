import { prisma, refundCredits, type Prisma } from "@useframe/db"
import { AppError } from "@/middleware/errorHandler.js"
import { CreditsService } from "@/modules/credits/credits.service.js"
import * as deployService from "@/lib/deployService.js"

export const DEPLOY_CREDIT_COST = 1

const DEPLOYABLE_STEP_STATUSES = ["PENDING", "REJECTED", "APPROVED"]

async function loadProject(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    include: { pipelineState: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  return project
}

export const DeployService = {
  // Free-tier gate: the existing DEPLOY pipeline lock, plus a balance check on top.
  async create(user: { id: string; email: string; plan: string }, slug: string) {
    const project = await loadProject(user.id, slug)
    const pipeline = project.pipelineState
    if (!pipeline) throw new AppError("Pipeline not initialized for this project", 409)
    if (pipeline.currentStep !== "DEPLOY") {
      throw new AppError("Deploy step is not currently active for this project", 409)
    }
    if (!DEPLOYABLE_STEP_STATUSES.includes(pipeline.deployStatus)) {
      throw new AppError("A deployment is already in progress for this project.", 409)
    }
    if (!project.currentVersionId) {
      throw new AppError("Project has no current version to deploy", 409)
    }
    if (!(await CreditsService.hasSufficientBalance(user.id, DEPLOY_CREDIT_COST))) {
      throw new AppError("Insufficient credits", 402)
    }

    const accepted = await deployService.requestDeployment({
      projectId: project.id,
      versionId: project.currentVersionId,
      userId: user.id,
    })

    let autoReloadTopUpCents: number | null
    try {
      autoReloadTopUpCents = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const result = await CreditsService.deduct(
          tx,
          user.id,
          DEPLOY_CREDIT_COST,
          "Deploy",
          accepted.deploymentId
        )
        await tx.creditTransaction.updateMany({
          where: { userId: user.id, type: "SPEND", refId: accepted.deploymentId, refType: null },
          data: { refType: "DEPLOYMENT" },
        })
        return result.autoReloadTopUpCents
      })
    } catch (err) {
      await deployService.cancelDeployment(project.id, accepted.deploymentId).catch(() => undefined)
      throw err
    }

    // The build may have failed before this charge existed, when the deploy
    // service's refund had nothing to refund; refundCredits is idempotent.
    const current = await deployService.getDeployment(project.id, accepted.deploymentId)
    if (current.status === "FAILED") {
      await refundCredits(prisma, {
        userId: user.id,
        refType: "DEPLOYMENT",
        refId: accepted.deploymentId,
        reason: "Deploy failed",
      })
    }

    if (autoReloadTopUpCents !== null) {
      await CreditsService.triggerAutoReload(user.id, autoReloadTopUpCents)
    }

    return { deploymentId: accepted.deploymentId, status: current.status, host: accepted.host }
  },

  async get(userId: string, slug: string, deploymentId: string) {
    const project = await loadProject(userId, slug)
    return deployService.getDeployment(project.id, deploymentId)
  },

  async list(userId: string, slug: string) {
    const project = await loadProject(userId, slug)
    return deployService.listDeployments(project.id)
  },

  async site(userId: string, slug: string) {
    const project = await loadProject(userId, slug)
    return deployService.getSite(project.id)
  },

  async rollback(userId: string, slug: string, deploymentId: string) {
    const project = await loadProject(userId, slug)
    return deployService.rollbackDeployment(project.id, deploymentId)
  },
}
