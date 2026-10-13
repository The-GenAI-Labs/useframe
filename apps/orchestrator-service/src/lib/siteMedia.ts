import type { Response } from "express"
import { Queue } from "bullmq"
import { prisma, type Prisma } from "@useframe/db"
import { QUEUES, type MediaGenerateJobPayload } from "@repo/events"
import type { SiteSpec } from "@repo/schemas"
import {
  buildMediaBrief,
  checkEligibility,
  createMediaJob,
  fitPlanToBalance,
  InsufficientCreditsError,
  isBlueprintFresh,
  loadBlueprintInputs,
  MediaBriefError,
  readBlueprint,
  readJobState,
  runSiteBlueprint,
  SUBSTEP_LABELS,
  type MediaItem,
  type PersistedBlueprint,
  type StructureResult,
  type Substep,
} from "@repo/media-ai"
import { env, mediaAiConfig } from "@/config/env.js"
import { mediaLlm } from "@/llm/claude.js"
import { sseWrite } from "@/llm/stream.js"
import { redis } from "@/lib/redis.js"
import type { ProjectBriefContext } from "@/lib/briefPipeline.js"

const queue = new Queue<MediaGenerateJobPayload>(QUEUES.MEDIA_GENERATE, { connection: redis })

export async function enqueueMediaJob(jobId: string): Promise<void> {
  await queue.add("generate", { jobId }, { jobId: `${jobId}-${Date.now()}`, attempts: 1, removeOnComplete: 500, removeOnFail: 500 })
}

export type SiteMediaPlan = {
  jobId: string | null
  blueprint: PersistedBlueprint | null
  structure?: StructureResult
}

const NONE: SiteMediaPlan = { jobId: null, blueprint: null }

function emitSubstep(res: Response, substep: Substep): void {
  sseWrite(res, { type: "stage", stage: "GENERATE", message: SUBSTEP_LABELS[substep], substep })
}

async function storeNotice(versionId: string, notice: string): Promise<void> {
  await prisma.projectVersion
    .update({
      where: { id: versionId },
      data: { blueprint: { status: "skipped", notice, createdAt: new Date().toISOString() } as Prisma.InputJsonValue },
    })
    .catch(() => undefined)
}

type PlanInput = {
  res: Response
  userId: string
  projectId: string
  versionId: string
  tier: "free" | "paid"
  spec: Partial<SiteSpec>
  briefCtx: ProjectBriefContext | null
  // full: no approved design brief, so the blueprint also designs the pages.
  full?: { prompt: string; parse: (raw: unknown) => { ok: true; value: StructureResult } | { ok: false; errors: string[] } }
}

// Runs the Site Blueprint and starts the media job for eligible paid projects.
// For every other project it returns at once: no extra call, no new fields.
export async function planSiteMedia(input: PlanInput): Promise<SiteMediaPlan> {
  if (input.tier !== "paid" || !mediaAiConfig.enabled) return NONE
  const inputs = await loadBlueprintInputs(prisma, input.projectId, input.userId, true).catch(() => null)
  if (!inputs) return NONE
  const eligibility = await checkEligibility(prisma, {
    userId: input.userId,
    projectId: input.projectId,
    mediaMode: inputs.media.mode,
    budgetTier: inputs.media.budgetTier,
    config: mediaAiConfig,
  })
  if (!eligibility.ok) {
    console.log(`[media] skipped for project ${input.projectId}: ${eligibility.reason}`)
    if (eligibility.reason === "circuit_open") await storeNotice(input.versionId, "AI media is temporarily unavailable, so this version was built without it.")
    return NONE
  }

  const balance = (await prisma.creditBalance.findUnique({ where: { userId: input.userId }, select: { balance: true } }))?.balance ?? 0
  if (balance < mediaAiConfig.credits.blueprint + mediaAiConfig.credits.image) {
    await storeNotice(input.versionId, "There weren't enough credits for AI media, so this version was built without it.")
    return NONE
  }

  const designBrief = input.spec.designBrief
  const palette = [
    ...(designBrief ? [designBrief.colors.primary, designBrief.colors.secondary, designBrief.colors.accent] : []),
  ]
  let mediaBrief
  try {
    mediaBrief = buildMediaBrief({
      brief: inputs.briefFacts,
      project: inputs.project,
      research: inputs.research,
      imageryFindingIds: inputs.imageryFindingIds,
      styleAvoid: [...inputs.styleAvoid, ...(designBrief?.avoid ?? [])],
      mediaNotes: inputs.media.notes,
      budget: eligibility.budget,
      hasProductPhotoUploads: inputs.hasProductPhotoUploads,
    })
  } catch (err) {
    if (err instanceof MediaBriefError) {
      console.log(`[media] skipped for project ${input.projectId}: ${err.message}`)
      return NONE
    }
    throw err
  }
  palette.push(mediaBrief.palette.primary, mediaBrief.palette.secondary, mediaBrief.palette.accent, ...mediaBrief.palette.neutrals)

  const generated = await prisma.mediaAsset.count({ where: { projectId: input.projectId, origin: "GENERATED", deletedAt: null } })
  const existing = readBlueprint(
    (await prisma.projectVersion.findUnique({ where: { id: input.versionId }, select: { blueprint: true } }))?.blueprint,
  )

  emitSubstep(input.res, "blueprint")
  let blueprint: PersistedBlueprint
  let structure: StructureResult | undefined
  const reused = !input.full && !!existing && !!input.spec.pages && isBlueprintFresh(existing, input.spec.pages, input.spec.copyFramework ?? "AIDA")
  if (reused) {
    blueprint = existing!
  } else {
    const result = await runSiteBlueprint({
      mode: input.full ? "full" : "brief",
      llm: mediaLlm,
      ...(input.full
        ? { structure: input.full }
        : {
            site: {
              pages: input.spec.pages ?? [],
              copyFramework: input.spec.copyFramework ?? "AIDA",
              tokens: {
                colors: palette,
                fonts: designBrief ? [designBrief.typography.primary, designBrief.typography.secondary] : [],
                styleTags: inputs.research?.styleTagKeys ?? [],
              },
            },
          }),
      palette,
      mediaBrief,
      briefFacts: inputs.briefFacts,
      research: inputs.research,
      uploaded: inputs.uploaded,
      budget: eligibility.budget,
      config: mediaAiConfig,
      mediaNotes: inputs.media.notes,
      generatedAllowance: mediaAiConfig.hardMaxGeneratedAssets - generated,
    }).catch((err: unknown) => {
      console.error(`[media] blueprint call failed for project ${input.projectId}:`, err instanceof Error ? err.name : "unknown")
      return { ok: false as const, errors: ["blueprint call failed"], attempts: 2, costUsd: 0 }
    })
    if (!result.ok) {
      console.log(`[media] blueprint failed twice for project ${input.projectId}`)
      await storeNotice(input.versionId, "We couldn't plan AI media for this version, so it was built without it. You can try again from the Media tab.")
      return NONE
    }
    blueprint = result.blueprint
    structure = result.structure
  }

  await prisma.projectVersion.update({
    where: { id: input.versionId },
    data: { blueprint: blueprint as unknown as Prisma.InputJsonValue },
  })

  const fitted = fitPlanToBalance(blueprint.mediaScript, balance, mediaAiConfig, { blueprint: !reused })
  try {
    const { jobId } = await createMediaJob(prisma, {
      userId: input.userId,
      projectId: input.projectId,
      mode: inputs.media.mode === "MANUAL" ? "MANUAL" : "AUTO",
      scope: { kind: "site" },
      versionId: input.versionId,
      plan: {
        items: fitted.items,
        dropped: [...blueprint.dropped, ...fitted.dropped],
        budget: eligibility.budget,
        budgetTier: inputs.media.budgetTier,
      },
      budget: eligibility.budget,
      budgetTier: inputs.media.budgetTier,
      mediaBrief: { ...mediaBrief, blueprint: { narrative: blueprint.narrative.storyArc, visualSystem: blueprint.visualSystem } },
      chargeBlueprint: !reused,
      config: mediaAiConfig,
      enqueue: enqueueMediaJob,
    })
    return { jobId, blueprint, ...(structure ? { structure } : {}) }
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      await storeNotice(input.versionId, "There weren't enough credits for AI media, so this version was built without it.")
      return { jobId: null, blueprint, ...(structure ? { structure } : {}) }
    }
    throw err
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

type JobSnapshot = { status: string; stage: string | null; state: unknown; bindings: unknown }

// Polls the job until `done` holds, it settles, it waits on the user, or time runs out.
async function waitForJob(res: Response, jobId: string, timeoutS: number, done: (job: JobSnapshot) => boolean): Promise<JobSnapshot | null> {
  const deadline = Date.now() + timeoutS * 1000
  let lastStage: string | null = null
  for (;;) {
    const job = await prisma.mediaJob.findUnique({ where: { id: jobId }, select: { status: true, stage: true, state: true, bindings: true } })
    if (!job) return null
    if (job.stage && job.stage !== lastStage && (job.stage as Substep) in SUBSTEP_LABELS) {
      lastStage = job.stage
      emitSubstep(res, job.stage as Substep)
    }
    if (job.status === "AWAITING_USER") emitSubstep(res, "media.awaiting_user")
    if (done(job) || ["DONE", "FAILED", "CANCELLED", "AWAITING_USER"].includes(job.status) || Date.now() >= deadline) return job
    await sleep(2000)
  }
}

const settled = (status: string) => ["DONE", "FAILED", "DROPPED", "SKIPPED"].includes(status)

export async function waitForImages(res: Response, jobId: string): Promise<JobSnapshot | null> {
  return waitForJob(res, jobId, env.MEDIA_IMAGES_TIMEOUT_S, (job) =>
    Object.values(readJobState(job.state).items).every((i) => i.item.kind !== "image" || settled(i.status)),
  )
}

export async function waitForAllMedia(res: Response, jobId: string): Promise<JobSnapshot | null> {
  return waitForJob(res, jobId, env.MEDIA_VIDEO_TIMEOUT_S, (job) => job.status === "DONE")
}

export function bindingsOf(job: JobSnapshot | null): NonNullable<SiteSpec["media"]> {
  const b = job?.bindings
  return b && typeof b === "object" ? (b as NonNullable<SiteSpec["media"]>) : {}
}

// Read-only context for the copy agent: what each section will show, so copy and visuals match.
export function copyMediaContext(blueprint: PersistedBlueprint, job: JobSnapshot | null, pageSlug: string, sectionId: string): string | undefined {
  const state = job ? readJobState(job.state) : null
  const items = blueprint.mediaScript.filter((i: MediaItem) => i.slotId.startsWith(`${pageSlug}/${sectionId}/`))
  if (items.length === 0) return undefined
  const lines = items.map((i) => {
    const s = state?.items[i.itemId]
    const alt = s?.image?.altText ?? s?.frames?.altText
    const concept = s?.concept?.concepts.find((c) => c.id === s.concept?.chosenId)
    return `- ${i.slotId.split("/")[2]}: ${i.kind} that should make the visitor feel: ${i.intent}${concept ? `; it shows: ${concept.logline}` : ""}${alt ? `; alt text: ${alt}` : ""}`
  })
  const itemSlots = items.map((i) => /item-(\d+)$/.exec(i.slotId)?.[1]).filter(Boolean).map(Number)
  const need = itemSlots.length ? Math.max(...itemSlots) + 1 : 0
  return [
    `Story of the whole site: ${blueprint.narrative.storyArc}`,
    `Media planned in this section:\n${lines.join("\n")}`,
    need ? `Write at least ${need} items so every planned visual has its item.` : "",
  ]
    .filter(Boolean)
    .join("\n")
}

