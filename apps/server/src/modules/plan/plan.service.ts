import { Queue } from "bullmq"
import { prisma, type Prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { ResearchPdfJobPayload } from "@repo/events"
import { redis } from "@/lib/redis.js"
import { AppError } from "@/middleware/errorHandler.js"
import { signAccessToken } from "@/lib/jwt.js"
import { callPlan } from "@/lib/orchestrator.js"
import { CreditsService } from "@/modules/credits/credits.service.js"
import type { DesignBrief } from "@repo/schemas"
import type { PlanPdfInput, PlanSelectInput } from "./plan.schema.js"

const RESEARCH_CREDIT_COST = 2

const researchPdfQueue = new Queue<ResearchPdfJobPayload>(QUEUES.RESEARCH_PDF, {
  connection: redis,
})

async function loadProjectWithPipeline(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    include: { pipelineState: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  if (!project.pipelineState) throw new AppError("Pipeline not initialized for this project", 409)
  if (!project.currentVersionId) throw new AppError("Project has no current version", 409)
  return project
}

export const PlanService = {
  async get(user: { id: string; email: string; plan: string }, slug: string) {
    const project = await prisma.project.findFirst({
      where: { slug, userId: user.id, deletedAt: null },
      select: { currentVersionId: true },
    })
    if (!project) throw new AppError("Project not found", 404)
    if (!project.currentVersionId) return { brief: null }

    const version = await prisma.projectVersion.findUnique({
      where: { id: project.currentVersionId },
      select: { designBrief: true },
    })

    return { brief: (version?.designBrief as unknown as DesignBrief | null) ?? null }
  },

  async update(user: { id: string; email: string; plan: string }, slug: string, brief: DesignBrief) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "RESEARCH" || pipeline.researchStatus !== "AWAITING_APPROVAL") {
      throw new AppError("Research is not awaiting approval", 409)
    }

    await prisma.projectVersion.update({
      where: { id: project.currentVersionId! },
      data: { designBrief: brief as unknown as Prisma.InputJsonValue },
    })

    return { brief }
  },

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

    // The orchestrator's /plan endpoint has no dedicated feedback field like
    // /research does — the planner re-derives the brief fresh from retrieval
    // each time rather than revising a previous one in place, so a reject's
    // feedback is folded directly into the idea text it re-reads from.
    const startupIdea = feedback
      ? `${project.startupIdea}\n\n(Revision note from a rejected earlier brief: ${feedback})`
      : project.startupIdea

    let planResult: Awaited<ReturnType<typeof callPlan>>
    try {
      planResult = await callPlan(
        {
          projectId: project.id,
          versionId: project.currentVersionId!,
          startupIdea,
          niche: project.niche,
          targetAudience: project.targetAudience,
          brandPersonality: project.brandPersonality ?? undefined,
          pricePositioning: project.pricePositioning ?? undefined,
          businessModel: project.businessModel ?? undefined,
          differentiator: project.differentiator ?? undefined,
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

    // The recommended candidate is stored so GET /research still returns a
    // brief (the tab renders it while the user decides), but it is NOT the
    // committed choice — select() overwrites it with whichever candidate the
    // user actually picks.
    await prisma.$transaction([
      prisma.projectVersion.update({
        where: { id: project.currentVersionId! },
        data: { designBrief: planResult.brief as unknown as Prisma.InputJsonValue },
      }),
      prisma.pipelineState.update({
        where: { projectId: project.id },
        data: { researchStatus: "AWAITING_APPROVAL" },
      }),
    ])

    return { brief: planResult.brief, candidates: planResult.candidates }
  },

  async approve(user: { id: string; email: string; plan: string }, slug: string) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "RESEARCH" || pipeline.researchStatus !== "AWAITING_APPROVAL") {
      throw new AppError("Research is not awaiting approval", 409)
    }

    const version = await prisma.projectVersion.findUniqueOrThrow({
      where: { id: project.currentVersionId! },
      select: { id: true, designBrief: true },
    })
    if (!version.designBrief) {
      throw new AppError("No design brief to approve", 409)
    }

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.generationOutcome.create({
        data: {
          projectId: project.id,
          versionId: version.id,
          brief: version.designBrief as Prisma.InputJsonValue,
          inputs: {
            startupIdea: project.startupIdea,
            niche: project.niche,
            targetAudience: project.targetAudience,
          } as Prisma.InputJsonValue,
        },
      })

      const { autoReloadTopUpCents } = await CreditsService.deduct(
        tx,
        user.id,
        RESEARCH_CREDIT_COST,
        "Research (design brief) approval",
        project.id
      )

      const updated = await tx.pipelineState.update({
        where: { projectId: project.id },
        data: {
          researchStatus: "APPROVED",
          currentStep: "WEBSITE",
          websiteStatus: "PENDING",
        },
      })

      return { pipelineState: updated, autoReloadTopUpCents }
    })

    if (result.autoReloadTopUpCents !== null) {
      await CreditsService.triggerAutoReload(user.id, result.autoReloadTopUpCents)
    }

    return { pipelineState: result.pipelineState }
  },

  // Two-candidate replacement for approve(): the user picks a direction
  // rather than approving a single pre-chosen brief. Everything after the
  // brief is resolved is identical to approve() — same outcome row, same
  // 2-credit Research deduction, same pipeline advance to WEBSITE — so the
  // two paths can't drift apart in what a "research complete" means.
  async select(
    user: { id: string; email: string; plan: string },
    slug: string,
    input: PlanSelectInput
  ) {
    const project = await loadProjectWithPipeline(user.id, slug)
    const pipeline = project.pipelineState!

    if (pipeline.currentStep !== "RESEARCH" || pipeline.researchStatus !== "AWAITING_APPROVAL") {
      throw new AppError("Research is not awaiting approval", 409)
    }

    const resolved = input.choice === "auto" ? input.recommended : input.choice
    const chosenBrief = resolved === "A" ? input.candidateA : input.candidateB

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.projectVersion.update({
        where: { id: project.currentVersionId! },
        data: { designBrief: chosenBrief as unknown as Prisma.InputJsonValue },
      })

      await tx.generationOutcome.create({
        data: {
          projectId: project.id,
          versionId: project.currentVersionId!,
          brief: chosenBrief as unknown as Prisma.InputJsonValue,
          inputs: {
            startupIdea: project.startupIdea,
            niche: project.niche,
            targetAudience: project.targetAudience,
          } as Prisma.InputJsonValue,
          selectionMethod: input.choice,
        },
      })

      const { autoReloadTopUpCents } = await CreditsService.deduct(
        tx,
        user.id,
        RESEARCH_CREDIT_COST,
        "Research (design direction) selection",
        project.id
      )

      const updated = await tx.pipelineState.update({
        where: { projectId: project.id },
        data: {
          researchStatus: "APPROVED",
          currentStep: "WEBSITE",
          websiteStatus: "PENDING",
        },
      })

      return { pipelineState: updated, autoReloadTopUpCents }
    })

    if (result.autoReloadTopUpCents !== null) {
      await CreditsService.triggerAutoReload(user.id, result.autoReloadTopUpCents)
    }

    return { pipelineState: result.pipelineState, brief: chosenBrief }
  },

  // Enqueues PDF generation on the worker (which owns Playwright) rather
  // than rendering inline — a browser launch per request would block the
  // API. The finished PDFs arrive as an assistant message with attachments.
  async requestPdf(
    user: { id: string; email: string; plan: string },
    slug: string,
    input: PlanPdfInput
  ) {
    const project = await prisma.project.findFirst({
      where: { slug, userId: user.id, deletedAt: null },
      select: { id: true },
    })
    if (!project) throw new AppError("Project not found", 404)

    // Competitor Analysis is only meaningful when scans exist — offering it
    // otherwise would produce an empty report.
    if (input.sections.includes("COMPETITOR_ANALYSIS")) {
      const scanCount = await prisma.competitorScan.count({
        where: { projectId: project.id, status: "DONE" },
      })
      if (scanCount === 0) {
        throw new AppError("No competitor scans exist for this project", 409)
      }
    }

    if (input.sections.includes("RESEARCH_RATIONALE")) {
      const report = await prisma.researchReport.findUnique({
        where: { projectId: project.id },
        select: { id: true },
      })
      if (!report) throw new AppError("No research report exists for this project yet", 409)
    }

    // The attachment message needs a conversation to live in; reuse the
    // project's existing one rather than creating a stray thread.
    const conversationId =
      input.conversationId ??
      (
        (await prisma.conversation.findFirst({
          where: { projectId: project.id, userId: user.id },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })) ??
        (await prisma.conversation.create({
          data: { projectId: project.id, userId: user.id },
          select: { id: true },
        }))
      ).id

    await researchPdfQueue.add("researchPdf", {
      projectId: project.id,
      userId: user.id,
      sections: input.sections,
      conversationId,
    })

    return { queued: true, conversationId }
  },

  async getDocument(user: { id: string }, documentId: string) {
    const doc = await prisma.researchDocument.findUnique({
      where: { id: documentId },
      select: { pdf: true, title: true, project: { select: { userId: true } } },
    })
    if (!doc || doc.project.userId !== user.id) {
      throw new AppError("Document not found", 404)
    }
    return { pdf: doc.pdf, title: doc.title }
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
