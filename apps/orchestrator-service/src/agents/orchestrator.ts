import type { Response } from "express"
import { sseWrite, sseError } from "@/llm/stream.js"
import { getModel } from "@/llm/providers.js"
import { runStructureAgent } from "./structure.agent.js"
import { runCopyAgent } from "./copy.agent.js"
import { runDesignAgent } from "./design.agent.js"
import { runSeoAgent } from "./seo.agent.js"
import { runCritiqueAgent } from "./critique.agent.js"
import { toSnapshot } from "@/spec/toSnapshot.js"
import { prisma } from "@useframe/db"
import type { GenerateRequest, SiteSpec, ModelId } from "@repo/schemas"
import { DEFAULT_MODEL_ID } from "@repo/schemas"

export async function runOrchestrator(
  res: Response,
  request: GenerateRequest,
): Promise<void> {
  const modelId: ModelId = request.modelId ?? DEFAULT_MODEL_ID
  const model = getModel(modelId)

  console.log(`[orchestrator] Using model: ${modelId}`)

  let spec: Partial<SiteSpec> = {
    projectId: request.projectId,
    versionId: request.versionId,
    citations: [],
  }

  try {
    sseWrite(res, {
      type: "stage",
      stage: "RESEARCH",
      message: "Querying research corpus...",
    })

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
      where: { id: request.versionId },
      data: { snapshot },
    })

    await prisma.project.update({
      where: { id: request.projectId },
      data: { status: "READY" },
    })

    sseWrite(res, {
      type: "version_ready",
      versionId: request.versionId,
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

    await prisma.project
      .update({
        where: { id: request.projectId },
        data: { status: "FAILED" },
      })
      .catch(() => {})
  } finally {
    res.end()
  }
}
