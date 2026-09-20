import { prisma, type Prisma } from "@useframe/db"
import type { SiteSpec } from "@repo/schemas"
import { AppError } from "@/middleware/errorHandler.js"
import { signAccessToken } from "@/lib/jwt.js"
import { callIterate } from "@/lib/orchestrator.js"

async function loadProjectWithPipeline(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    include: { pipelineState: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  if (!project.pipelineState) throw new AppError("Pipeline not initialized for this project", 409)
  return project
}

export const WebsiteService = {
  async reject(
    user: { id: string; email: string; plan: string },
    slug: string,
    feedback: string
  ) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "WEBSITE" || pipeline.websiteStatus !== "AWAITING_APPROVAL") {
      throw new AppError("Website step is not awaiting approval", 409)
    }
    if (!project.currentVersionId) {
      throw new AppError("Project has no current version to iterate on", 409)
    }

    const version = await prisma.projectVersion.findUniqueOrThrow({
      where: { id: project.currentVersionId },
    })

    const internalToken = signAccessToken({ id: user.id, email: user.email, plan: user.plan })

    const iterateResult = await callIterate(
      {
        projectId: project.id,
        versionId: version.id,
        instruction: feedback,
        currentSpec: version.snapshot as unknown as SiteSpec,
      },
      internalToken
    )

    const newVersion = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.projectVersion.create({
        data: {
          projectId: project.id,
          versionNumber: version.versionNumber + 1,
          siteType: version.siteType,
          seo: version.seo as Prisma.InputJsonValue,
          parentVersionId: version.id,
          snapshot: iterateResult.updatedSpec as unknown as object,
        },
      })

      await tx.project.update({
        where: { id: project.id },
        data: { currentVersionId: created.id },
      })

      await tx.pipelineState.update({
        where: { projectId: project.id },
        data: {
          websiteStatus: "AWAITING_APPROVAL",
          feedbackHistory: [
            ...(Array.isArray(pipeline.feedbackHistory) ? (pipeline.feedbackHistory as unknown[]) : []),
            { step: "WEBSITE", feedback, createdAt: new Date().toISOString() },
          ] as Prisma.InputJsonValue,
        },
      })

      return created
    })

    return {
      version: { id: newVersion.id, versionNumber: newVersion.versionNumber },
      summary: iterateResult.summary,
    }
  },

  async approve(user: { id: string; email: string; plan: string }, slug: string) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "WEBSITE" || pipeline.websiteStatus !== "AWAITING_APPROVAL") {
      throw new AppError("Website step is not awaiting approval", 409)
    }

    const updated = await prisma.pipelineState.update({
      where: { projectId: project.id },
      data: {
        websiteStatus: "APPROVED",
        currentStep: "SEO",
        seoStatus: "PENDING",
      },
    })

    return { pipelineState: updated }
  },
}
