import { prisma, type Prisma } from "@useframe/db"
import { AppError } from "@/middleware/errorHandler.js"
import { signAccessToken } from "@/lib/jwt.js"
import { callResearch } from "@/lib/orchestrator.js"
import type { ResearchReportData } from "@repo/schemas"

async function loadProjectWithPipeline(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    include: { pipelineState: true, researchReport: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  if (!project.pipelineState) throw new AppError("Pipeline not initialized for this project", 409)
  return project
}

export const ResearchService = {
  async generate(
    user: { id: string; email: string; plan: string },
    slug: string,
    feedback?: string
  ) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "RESEARCH") {
      throw new AppError("Research step is not currently active for this project", 409)
    }
    if (!["PENDING", "REJECTED"].includes(pipeline.researchStatus)) {
      throw new AppError("Research is already running or awaiting review", 409)
    }

    await prisma.pipelineState.update({
      where: { projectId: project.id },
      data: { researchStatus: "RUNNING" },
    })

    const internalToken = signAccessToken({ id: user.id, email: user.email, plan: user.plan })

    let report: ResearchReportData
    try {
      report = await callResearch(
        {
          startupIdea: project.startupIdea,
          niche: project.niche,
          targetAudience: project.targetAudience,
          feedback,
          previousReport: project.researchReport
            ? (project.researchReport as unknown as Record<string, unknown>)
            : undefined,
        },
        internalToken
      )
    } catch (err) {
      await prisma.pipelineState.update({
        where: { projectId: project.id },
        data: { researchStatus: "PENDING" },
      })
      throw err
    }

    await prisma.$transaction([
      prisma.researchReport.upsert({
        where: { projectId: project.id },
        create: {
          projectId: project.id,
          inputType: project.inputType,
          ...report,
          colorPalette: report.colorPalette as Prisma.InputJsonValue,
          imageDirection: report.imageDirection as Prisma.InputJsonValue,
          seoKeywords: report.seoKeywords as Prisma.InputJsonValue | undefined,
          competitorInsights: report.competitorInsights as Prisma.InputJsonValue | undefined,
          citations: report.citations as Prisma.InputJsonValue,
        },
        update: {
          ...report,
          colorPalette: report.colorPalette as Prisma.InputJsonValue,
          imageDirection: report.imageDirection as Prisma.InputJsonValue,
          seoKeywords: report.seoKeywords as Prisma.InputJsonValue | undefined,
          competitorInsights: report.competitorInsights as Prisma.InputJsonValue | undefined,
          citations: report.citations as Prisma.InputJsonValue,
        },
      }),
      prisma.pipelineState.update({
        where: { projectId: project.id },
        data: { researchStatus: "AWAITING_APPROVAL" },
      }),
    ])

    return { report }
  },

  async approve(user: { id: string; email: string; plan: string }, slug: string) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "RESEARCH" || pipeline.researchStatus !== "AWAITING_APPROVAL") {
      throw new AppError("Research is not awaiting approval", 409)
    }

    // Website generation runs over SSE from the browser (see WorkspaceShell's
    // auto-start effect) — there's no server-side "run it now" call to make
    // here. Unlocking websiteStatus to PENDING is what lets that effect fire,
    // in both AUTO and MANUAL mode; MANUAL just also requires the user to be
    // looking at the Website step for it to matter (nothing extra to gate).
    const updated = await prisma.pipelineState.update({
      where: { projectId: project.id },
      data: {
        researchStatus: "APPROVED",
        currentStep: "WEBSITE",
        websiteStatus: "PENDING",
      },
    })

    return { pipelineState: updated }
  },

  async reject(
    user: { id: string; email: string; plan: string },
    slug: string,
    feedback: string
  ) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "RESEARCH" || pipeline.researchStatus !== "AWAITING_APPROVAL") {
      throw new AppError("Research is not awaiting approval", 409)
    }

    const history = Array.isArray(pipeline.feedbackHistory)
      ? (pipeline.feedbackHistory as unknown[])
      : []

    const updated = await prisma.pipelineState.update({
      where: { projectId: project.id },
      data: {
        researchStatus: "REJECTED",
        feedbackHistory: [
          ...history,
          { step: "RESEARCH", feedback, createdAt: new Date().toISOString() },
        ] as Prisma.InputJsonValue,
      },
    })

    return { pipelineState: updated }
  },
}
