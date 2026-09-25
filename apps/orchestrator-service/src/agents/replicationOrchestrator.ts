import type { Response } from "express"
import { sseWrite, sseError } from "@/llm/stream.js"
import { getModelForTier } from "@/llm/router.js"
import { runStructureAgent } from "./structure.agent.js"
import { runCopyAgent } from "./copy.agent.js"
import { runDesignAgent } from "./design.agent.js"
import { runSeoAgent } from "./seo.agent.js"
import { runCritiqueAgent } from "./critique.agent.js"
import { toSnapshot } from "@/spec/toSnapshot.js"
import { prisma } from "@useframe/db"
import type { GenerateRequest, SiteSpec, DesignBrief } from "@repo/schemas"

export async function runReplicationOrchestrator(
  res: Response,
  replicationId: string,
  sourceUrl: string,
  designBrief: DesignBrief,
  tier: "free" | "paid",
): Promise<void> {
  const model = getModelForTier(tier)

  const request: GenerateRequest = {
    startupIdea: `Exact replica of ${sourceUrl}`,
    niche: "OTHER",
    targetAudience: "Same audience as the source site",
    inputType: "FROM_OWN_SITE",
    sourceUrl,
    tier,
  }

  try {
    let spec: Partial<SiteSpec> = {
      projectId: replicationId,
      versionId: replicationId,
      citations: [],
      designBrief,
    }

    sseWrite(res, { type: "stage", stage: "GENERATE", message: "Building page structure..." })
    spec = await runStructureAgent(res, spec, request, model)

    sseWrite(res, { type: "stage", stage: "COPY", message: "Writing conversion copy..." })
    spec = await runCopyAgent(res, spec, request, model)

    sseWrite(res, { type: "stage", stage: "GENERATE", message: "Applying design system..." })
    spec = await runDesignAgent(res, spec, request, model)

    sseWrite(res, { type: "stage", stage: "SEO", message: "Optimising for search..." })
    spec = await runSeoAgent(spec, request, model)

    sseWrite(res, { type: "stage", stage: "CRITIQUE", message: "Running critique pass..." })
    spec = await runCritiqueAgent(spec, request, model)

    const snapshot = toSnapshot(spec as SiteSpec)

    await prisma.replication.update({
      where: { id: replicationId },
      data: { snapshot, status: "READY" },
    })

    sseWrite(res, { type: "version_ready", versionId: replicationId, snapshot })
    sseWrite(res, { type: "stage", stage: "COMPLETE", message: "Generation complete." })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed"
    sseError(res, message)

    await prisma.replication
      .update({ where: { id: replicationId }, data: { status: "FAILED", failureReason: message } })
      .catch(() => {})
  } finally {
    res.end()
  }
}
