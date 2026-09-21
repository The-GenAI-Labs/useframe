import type { Response } from "express"
import { sseWrite, sseError } from "@/llm/stream.js"
import { getModelForTier } from "@/llm/router.js"
import { runStructureAgent } from "./structure.agent.js"
import { runCopyAgent } from "./copy.agent.js"
import { runDesignAgent } from "./design.agent.js"
import { runSeoAgent } from "./seo.agent.js"
import { runCritiqueAgent } from "./critique.agent.js"
import { toSnapshot } from "@/spec/toSnapshot.js"
import { uniqueSlug } from "@/lib/slug.js"
import { prisma } from "@useframe/db"
import type { GenerateRequest, SiteSpec } from "@repo/schemas"

async function ensureProject(
  request: GenerateRequest,
  userId: string,
): Promise<{ projectId: string; versionId: string }> {
  if (request.projectId && request.versionId) {
    return { projectId: request.projectId, versionId: request.versionId }
  }

  const slug = uniqueSlug(request.name ?? request.startupIdea.slice(0, 40))

  const project = await prisma.project.create({
    data: {
      userId,
      name: request.name ?? request.startupIdea.slice(0, 60),
      slug,
      startupIdea: request.startupIdea,
      niche: request.niche as never,
      targetAudience: request.targetAudience,
      brandPersonality: request.brandPersonality,
      pricePositioning: request.pricePositioning,
      businessModel: request.businessModel,
      differentiator: request.differentiator,
      inputType: request.inputType,
      sourceUrl: request.sourceUrl,
      status: "GENERATING",
    },
  })

  const version = await prisma.projectVersion.create({
    data: {
      projectId: project.id,
      versionNumber: 1,
      snapshot: {},
    },
  })

  await prisma.project.update({
    where: { id: project.id },
    // generationTier mirrors apps/server's projects.service.ts stamp — this
    // is the OTHER path that creates a Project row directly (when the
    // caller didn't already create one via POST /projects first), so the
    // workspace's model-tier banner reads a correct value either way.
    data: { currentVersionId: version.id, generationTier: request.tier === "free" ? "FREE" : "PAID" },
  })

  await prisma.pipelineState.create({
    data: { projectId: project.id, mode: request.pipelineMode ?? "MANUAL" },
  })

  return { projectId: project.id, versionId: version.id }
}

export async function runOrchestrator(
  res: Response,
  request: GenerateRequest,
  userId: string,
): Promise<void> {
  const model = getModelForTier(request.tier)

  console.log(`[orchestrator] Using tier: ${request.tier}`)

  let projectId = request.projectId
  let versionId = request.versionId

  try {
    const ids = await ensureProject(request, userId)
    projectId = ids.projectId
    versionId = ids.versionId

    if (!request.projectId || !request.versionId) {
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { slug: true },
      })
      sseWrite(res, {
        type: "project_created",
        projectId,
        versionId,
        slug: project.slug,
      })
    }

    // When this version has an approved DesignBrief (set by the Research
    // step's /plan/approve flow), structure/design/copy execute it instead
    // of deciding from scratch. Older projects or a manual /generate call
    // with no brief simply have designBrief undefined here, and every agent
    // falls back to its original from-scratch behavior — no breaking change.
    const versionWithBrief = await prisma.projectVersion.findUnique({
      where: { id: versionId },
      select: { designBrief: true },
    })

    let spec: Partial<SiteSpec> = {
      projectId,
      versionId,
      citations: [],
      designBrief: (versionWithBrief?.designBrief as SiteSpec["designBrief"]) ?? undefined,
    }

    sseWrite(res, {
      type: "stage",
      stage: "GENERATE",
      message: "Building page structure...",
    })
    spec = await runStructureAgent(res, spec, request, model)

    sseWrite(res, {
      type: "stage",
      stage: "COPY",
      message: "Writing conversion copy...",
    })
    spec = await runCopyAgent(res, spec, request, model)

    sseWrite(res, {
      type: "stage",
      stage: "GENERATE",
      message: "Applying design system...",
    })
    spec = await runDesignAgent(res, spec, request, model)

    sseWrite(res, {
      type: "stage",
      stage: "SEO",
      message: "Optimising for search...",
    })
    spec = await runSeoAgent(spec, request, model)

    sseWrite(res, {
      type: "stage",
      stage: "CRITIQUE",
      message: "Running critique pass...",
    })
    spec = await runCritiqueAgent(spec, request, model)

    const snapshot = toSnapshot(spec as SiteSpec)

    await prisma.projectVersion.update({
      where: { id: versionId },
      data: { snapshot },
    })

    await prisma.project.update({
      where: { id: projectId },
      data: { status: "READY" },
    })

    await prisma.pipelineState
      .update({
        where: { projectId },
        data: { websiteStatus: "AWAITING_APPROVAL" },
      })
      .catch(() => {})

    sseWrite(res, {
      type: "version_ready",
      versionId,
      snapshot,
    })

    sseWrite(res, {
      type: "stage",
      stage: "COMPLETE",
      message: "Generation complete.",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed"
    sseError(res, message)

    if (projectId) {
      await prisma.project
        .update({
          where: { id: projectId },
          data: { status: "FAILED" },
        })
        .catch(() => {})
    }
  } finally {
    res.end()
  }
}
