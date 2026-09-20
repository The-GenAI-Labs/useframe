import { prisma, type Prisma } from "@useframe/db"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { DeployJobPayload } from "@repo/events"
import { redis } from "@/lib/redis.js"
import { AppError } from "@/middleware/errorHandler.js"
import { CreditsService } from "@/modules/credits/credits.service.js"

const deployQueue = new Queue(QUEUES.DEPLOY, { connection: redis })
const DEPLOY_CREDIT_COST = 1

async function loadProjectWithPipeline(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    include: { pipelineState: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  if (!project.pipelineState) throw new AppError("Pipeline not initialized for this project", 409)
  return project
}

export const DeployService = {
  async create(user: { id: string; email: string; plan: string }, slug: string) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "DEPLOY") {
      throw new AppError("Deploy step is not currently active for this project", 409)
    }
    if (!["PENDING", "REJECTED"].includes(pipeline.deployStatus)) {
      throw new AppError("A deploy is already running or awaiting review", 409)
    }
    if (!project.currentVersionId) {
      throw new AppError("Project has no current version to deploy", 409)
    }

    const deployment = await prisma.deployment.create({
      data: {
        projectId: project.id,
        versionId: project.currentVersionId,
        userId: user.id,
        subdomain: project.slug,
        status: "QUEUED",
      },
    })

    await prisma.pipelineState.update({
      where: { projectId: project.id },
      data: { deployStatus: "RUNNING" },
    })

    const payload: DeployJobPayload = {
      deploymentId: deployment.id,
      projectId: project.id,
      versionId: project.currentVersionId,
      userId: user.id,
      tier: "free",
      adapter: "vercel",
    }

    await deployQueue.add("deploy", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    })

    return { deploymentId: deployment.id }
  },

  async get(userId: string, slug: string, deploymentId: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId, deletedAt: null },
      select: { id: true },
    })
    if (!project) throw new AppError("Project not found", 404)

    const deployment = await prisma.deployment.findFirst({
      where: { id: deploymentId, projectId: project.id },
    })
    if (!deployment) throw new AppError("Deployment not found", 404)

    return {
      id: deployment.id,
      status: deployment.status,
      liveUrl: deployment.liveUrl,
      failureReason: deployment.failureReason,
      buildDurationMs: deployment.buildDurationMs,
    }
  },

  async approve(user: { id: string; email: string; plan: string }, slug: string) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "DEPLOY" || pipeline.deployStatus !== "AWAITING_APPROVAL") {
      throw new AppError("Deploy is not awaiting approval", 409)
    }

    const deployment = await prisma.deployment.findFirst({
      where: { projectId: project.id, status: "LIVE" },
      orderBy: { createdAt: "desc" },
    })
    if (!deployment) throw new AppError("No live deployment to approve", 409)

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const { autoReloadTopUpCents } = await CreditsService.deduct(
        tx,
        user.id,
        DEPLOY_CREDIT_COST,
        "Deploy approval",
        project.id
      )

      const updated = await tx.pipelineState.update({
        where: { projectId: project.id },
        data: { deployStatus: "APPROVED" },
      })

      return { pipelineState: updated, autoReloadTopUpCents }
    })

    if (result.autoReloadTopUpCents !== null) {
      await CreditsService.triggerAutoReload(user.id, result.autoReloadTopUpCents)
    }

    return { pipelineState: result.pipelineState }
  },
}
