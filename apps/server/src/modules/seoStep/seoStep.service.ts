import { prisma, type Prisma } from "@useframe/db"
import type { SiteSpec } from "@repo/schemas"
import { AppError } from "@/middleware/errorHandler.js"
import { signAccessToken } from "@/lib/jwt.js"
import { callSeoMaterialize } from "@/lib/orchestrator.js"
import { CreditsService } from "@/modules/credits/credits.service.js"

const SEO_CREDIT_COST = 1

async function loadProjectWithPipeline(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    include: { pipelineState: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  if (!project.pipelineState) throw new AppError("Pipeline not initialized for this project", 409)
  return project
}

export const SeoStepService = {
  async generate(user: { id: string; email: string; plan: string }, slug: string) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "SEO") {
      throw new AppError("SEO step is not currently active for this project", 409)
    }
    if (!["PENDING", "REJECTED"].includes(pipeline.seoStatus)) {
      throw new AppError("SEO is already running or awaiting review", 409)
    }
    if (!project.currentVersionId) {
      throw new AppError("Project has no current version to materialize SEO for", 409)
    }

    const version = await prisma.projectVersion.findUniqueOrThrow({
      where: { id: project.currentVersionId },
    })

    await prisma.pipelineState.update({
      where: { projectId: project.id },
      data: { seoStatus: "RUNNING" },
    })

    const internalToken = signAccessToken({ id: user.id, email: user.email, plan: user.plan })
    const baseUrl = `https://${project.slug}.useframe.app`

    let result
    try {
      result = await callSeoMaterialize(
        {
          spec: version.snapshot as unknown as SiteSpec,
          startupIdea: project.startupIdea,
          niche: project.niche,
          baseUrl,
        },
        internalToken
      )
    } catch (err) {
      await prisma.pipelineState.update({
        where: { projectId: project.id },
        data: { seoStatus: "PENDING" },
      })
      throw err
    }

    await prisma.$transaction([
      prisma.projectVersion.update({
        where: { id: version.id },
        data: {
          snapshot: result.spec as unknown as object,
          seo: {
            robotsTxt: result.robotsTxt,
            sitemapXml: result.sitemapXml,
            keywordValidation: result.keywordValidation,
          } as Prisma.InputJsonValue,
        },
      }),
      prisma.pipelineState.update({
        where: { projectId: project.id },
        data: { seoStatus: "AWAITING_APPROVAL" },
      }),
    ])

    return result
  },

  async approve(user: { id: string; email: string; plan: string }, slug: string) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "SEO" || pipeline.seoStatus !== "AWAITING_APPROVAL") {
      throw new AppError("SEO step is not awaiting approval", 409)
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const { autoReloadTopUpCents } = await CreditsService.deduct(
        tx,
        user.id,
        SEO_CREDIT_COST,
        "SEO step approval",
        project.id
      )

      const updated = await tx.pipelineState.update({
        where: { projectId: project.id },
        data: {
          seoStatus: "APPROVED",
          currentStep: "DEPLOY",
          deployStatus: "PENDING",
        },
      })

      return { pipelineState: updated, autoReloadTopUpCents }
    })

    if (result.autoReloadTopUpCents !== null) {
      await CreditsService.triggerAutoReload(user.id, result.autoReloadTopUpCents)
    }

    return { pipelineState: result.pipelineState }
  },

  async reject(
    user: { id: string; email: string; plan: string },
    slug: string,
    feedback: string
  ) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "SEO" || pipeline.seoStatus !== "AWAITING_APPROVAL") {
      throw new AppError("SEO step is not awaiting approval", 409)
    }

    const history = Array.isArray(pipeline.feedbackHistory)
      ? (pipeline.feedbackHistory as unknown[])
      : []

    const updated = await prisma.pipelineState.update({
      where: { projectId: project.id },
      data: {
        seoStatus: "REJECTED",
        feedbackHistory: [
          ...history,
          { step: "SEO", feedback, createdAt: new Date().toISOString() },
        ] as Prisma.InputJsonValue,
      },
    })

    return { pipelineState: updated }
  },
}
