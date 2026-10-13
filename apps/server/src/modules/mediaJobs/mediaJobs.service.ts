import { Queue } from "bullmq"
import { briefStateOf, prisma } from "@useframe/db"
import { QUEUES, type MediaGenerateJobPayload } from "@repo/events"
import type { SiteSpec } from "@repo/schemas"
import {
  ACTIVE_JOB_STATUSES,
  applyCheckpointAction,
  budgetFor,
  checkEligibility,
  CheckpointError,
  costItems,
  createMediaJob,
  estimateJobCost,
  InsufficientCreditsError,
  isBlueprintFresh,
  isPaidUser,
  maxCreditsForBudget,
  MECHANISM_LABELS,
  mediaSettingsOf,
  planningSlots,
  readBlueprint,
  readBlueprintNotice,
  readJobState,
  refundUnspent,
  SUBSTEP_LABELS,
  type CheckpointAction,
  type IneligibleReason,
  type ItemState,
  type MediaBudgetTier,
  type StartJobInput,
  type Substep,
} from "@repo/media-ai"
import { env, mediaAiConfig } from "@/config/env.js"
import { redis } from "@/lib/redis.js"
import { AppError } from "@/middleware/errorHandler.js"
import { signMediaUrl } from "@/modules/media/media.signing.js"

let queue: Queue<MediaGenerateJobPayload> | null = null

async function enqueue(jobId: string): Promise<void> {
  queue ??= new Queue<MediaGenerateJobPayload>(QUEUES.MEDIA_GENERATE, { connection: redis })
  await queue.add("generate", { jobId }, { jobId: `${jobId}-${Date.now()}`, attempts: 1, removeOnComplete: 500, removeOnFail: 500 })
}

async function requirePaid(userId: string): Promise<void> {
  if (!(await isPaidUser(prisma, userId))) {
    throw new AppError("AI images and videos are available on paid plans", 403, "PAID_FEATURE")
  }
}

async function loadProject(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    select: { id: true, currentVersionId: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  return project
}

async function briefSettings(projectId: string, userId: string) {
  const brief = await prisma.projectBrief.findFirst({ where: { projectId, userId } })
  return mediaSettingsOf(brief ? (briefStateOf(brief).data as Record<string, unknown>) : null, true)
}

async function currentVersion(projectId: string, versionId: string | null) {
  if (!versionId) return null
  const version = await prisma.projectVersion.findFirst({
    where: { id: versionId, projectId },
    select: { id: true, snapshot: true, blueprint: true },
  })
  const spec = version?.snapshot as Partial<SiteSpec> | null
  return version && spec?.pages?.length ? { ...version, spec: spec as SiteSpec } : null
}

const REASONS: Record<IneligibleReason, [string, number]> = {
  disabled: ["AI media isn't available right now", 503],
  free: ["AI images and videos are available on paid plans", 403],
  mode_off: ["AI media is turned off for this project", 409],
  no_budget: ["Choose how much AI media you want first", 409],
  circuit_open: ["AI media is temporarily unavailable. Please try again later.", 503],
  project_busy: ["AI media is already being made for this project", 409],
  project_daily_limit: ["You've reached today's limit of AI media runs for this project", 429],
  user_busy: ["You already have two AI media runs in progress", 409],
}

const sign = (assetId: string | undefined, role: "w960" | "mp4_720" | "poster") => {
  if (!assetId || !env.MEDIA_SIGNING_SECRET) return null
  try {
    return signMediaUrl(assetId, role)
  } catch {
    return null
  }
}

function itemView(s: ItemState, charges: Record<string, number>) {
  const scores = new Map(s.concept?.ranked.map((r) => [r.id, r.score]) ?? [])
  return {
    itemId: s.item.itemId,
    slotId: s.item.slotId,
    kind: s.item.kind,
    decision: s.item.decision,
    role: s.item.role,
    intent: s.item.intent,
    reason: s.item.reason,
    aspect: s.item.aspect,
    durationSec: s.video?.durationSec ?? s.item.video?.durationSec ?? null,
    status: s.status,
    failureReason: s.failureReason ?? null,
    credits: charges[s.item.itemId] ?? 0,
    concepts:
      s.concept?.concepts.map((c) => ({
        id: c.id,
        title: c.title,
        logline: c.logline,
        whyItFits: c.whyItFits,
        mechanism: MECHANISM_LABELS[c.mechanism],
        beats: c.beats,
        score: scores.get(c.id) ?? null,
      })) ?? [],
    recommendedId: s.concept?.recommendedId ?? null,
    chosenId: s.concept?.chosenId ?? null,
    conceptRegenerationsLeft: Math.max(0, 2 - (s.concept?.regenerations ?? 0)),
    frames: s.frames ? { opening: sign(s.frames.openingAssetId, "w960"), ending: sign(s.frames.endingAssetId, "w960") } : null,
    image: s.image ? sign(s.image.assetId, "w960") : null,
    candidates:
      s.video?.candidateAssetIds.map((id) => ({
        id,
        video: sign(id, "mp4_720"),
        poster: sign(id, "poster"),
        notes: s.video?.qa?.[id]?.notes ?? null,
      })) ?? [],
    chosenCandidateId: s.video?.chosenAssetId ?? null,
    usesStill: !!s.fallbackAssetId,
  }
}

type JobRow = NonNullable<Awaited<ReturnType<typeof prisma.mediaJob.findFirst>>>

function jobView(job: JobRow) {
  const state = readJobState(job.state)
  const plan = (job.plan ?? {}) as { dropped?: { itemId: string; reason: string }[] }
  return {
    id: job.id,
    mode: job.mode,
    status: job.status,
    stage: job.stage,
    stageLabel: job.stage && job.stage in SUBSTEP_LABELS ? SUBSTEP_LABELS[job.stage as Substep] : null,
    checkpoint: job.checkpoint,
    checkpointExpiresAt: job.checkpointExpiresAt,
    failureReason: job.failureReason,
    creditsReserved: job.creditsReserved,
    creditsRefunded: job.creditsRefunded,
    resultVersionId: job.resultVersionId,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    dropped: plan.dropped ?? [],
    items: Object.values(state.items).map((s) => itemView(s, state.charges)),
  }
}

async function loadJob(userId: string, slug: string, jobId: string) {
  const project = await loadProject(userId, slug)
  const job = await prisma.mediaJob.findFirst({ where: { id: jobId, projectId: project.id, userId } })
  if (!job) throw new AppError("Media job not found", 404)
  return { project, job }
}

export const MediaJobsService = {
  // An upper bound for a budget tier, for the brief before any plan exists.
  async accountEstimate(userId: string, tier: MediaBudgetTier) {
    await requirePaid(userId)
    const budget = budgetFor(mediaAiConfig, tier)
    return { credits: maxCreditsForBudget(budget, mediaAiConfig, { blueprint: true }), budget, maximum: true }
  },

  async estimate(userId: string, slug: string) {
    await requirePaid(userId)
    const project = await loadProject(userId, slug)
    const settings = await briefSettings(project.id, userId)
    const budget = budgetFor(mediaAiConfig, settings.budgetTier)
    const version = await currentVersion(project.id, project.currentVersionId)
    const blueprint = version ? readBlueprint(version.blueprint) : null
    const balance = (await prisma.creditBalance.findUnique({ where: { userId }, select: { balance: true } }))?.balance ?? 0
    if (version && blueprint && isBlueprintFresh(blueprint, version.spec.pages, version.spec.copyFramework)) {
      const estimate = estimateJobCost(costItems(blueprint.mediaScript), mediaAiConfig)
      return { credits: estimate.credits, items: estimate.items, balance, budgetTier: settings.budgetTier, maximum: false }
    }
    const credits = maxCreditsForBudget(budget, mediaAiConfig, { blueprint: true })
    return {
      credits,
      items: [
        { kind: "image" as const, count: budget.maxImages, credits: budget.maxImages * mediaAiConfig.credits.image },
        { kind: "video" as const, count: budget.maxVideos, credits: credits - budget.maxImages * mediaAiConfig.credits.image - mediaAiConfig.credits.blueprint },
        { kind: "blueprint" as const, count: 1, credits: mediaAiConfig.credits.blueprint },
      ],
      balance,
      budgetTier: settings.budgetTier,
      maximum: true,
    }
  },

  async start(userId: string, slug: string, input: StartJobInput) {
    await requirePaid(userId)
    const project = await loadProject(userId, slug)
    const version = await currentVersion(project.id, project.currentVersionId)
    if (!version) throw new AppError("Generate your site first, then add AI media", 409, "MEDIA_NO_SITE")
    const settings = await briefSettings(project.id, userId)
    const eligibility = await checkEligibility(prisma, {
      userId,
      projectId: project.id,
      mediaMode: input.mode,
      budgetTier: settings.budgetTier,
      config: mediaAiConfig,
    })
    if (!eligibility.ok) {
      const [message, status] = REASONS[eligibility.reason]
      throw new AppError(message, status, eligibility.reason === "free" ? "PAID_FEATURE" : `MEDIA_${eligibility.reason.toUpperCase()}`)
    }
    if (input.scope.kind === "slots") {
      const known = new Set(planningSlots(version.spec.pages).map((r) => r.slotId))
      const unknown = input.scope.slotIds.filter((id) => !known.has(id))
      if (unknown.length) throw new AppError("Some of those spots don't exist on this site", 422, "MEDIA_UNKNOWN_SLOT")
    }
    const blueprint = readBlueprint(version.blueprint)
    const inScope = (slotId: string) => input.scope.kind === "site" || input.scope.slotIds.includes(slotId)
    const fresh = blueprint && isBlueprintFresh(blueprint, version.spec.pages, version.spec.copyFramework)
    const planned = fresh ? blueprint.mediaScript.filter((i) => inScope(i.slotId)) : []
    const mediaBrief = planned.length && blueprint ? await mediaBriefFor(project.id, userId, blueprint) : undefined
    // Without an earlier media brief the job plans for itself, which may reuse the fresh blueprint.
    const items = mediaBrief ? planned : []
    try {
      const { jobId } = await createMediaJob(prisma, {
        userId,
        projectId: project.id,
        mode: input.mode,
        scope: input.scope,
        versionId: version.id,
        plan: items.length ? { items, dropped: [], budget: eligibility.budget, budgetTier: settings.budgetTier } : null,
        budget: eligibility.budget,
        budgetTier: settings.budgetTier,
        ...(mediaBrief ? { mediaBrief } : {}),
        chargeBlueprint: !items.length,
        config: mediaAiConfig,
        enqueue,
        baseMedia: (version.spec.media ?? {}) as Record<string, unknown>,
      })
      const job = await prisma.mediaJob.findUniqueOrThrow({ where: { id: jobId } })
      return jobView(job)
    } catch (err) {
      if (err instanceof InsufficientCreditsError) {
        throw new AppError(`You need ${err.needed} credits for this; you have ${err.balance}`, 402, "INSUFFICIENT_CREDITS", {
          data: { needed: err.needed, balance: err.balance },
        })
      }
      throw err
    }
  },

  // Viewing, answering or cancelling an existing run needs ownership, not a balance:
  // a run may have reserved the user's last credits.
  async latest(userId: string, slug: string) {
    const project = await loadProject(userId, slug)
    const [job, version] = await Promise.all([
      prisma.mediaJob.findFirst({ where: { projectId: project.id, userId }, orderBy: { createdAt: "desc" } }),
      project.currentVersionId
        ? prisma.projectVersion.findFirst({ where: { id: project.currentVersionId, projectId: project.id }, select: { blueprint: true } })
        : null,
    ])
    const blueprint = readBlueprint(version?.blueprint)
    return {
      job: job ? jobView(job) : null,
      notice: readBlueprintNotice(version?.blueprint)?.notice ?? null,
      narrative: blueprint?.narrative ?? null,
      script: blueprint?.mediaScript.map((i) => ({ itemId: i.itemId, slotId: i.slotId, kind: i.kind, role: i.role, reason: i.reason, intent: i.intent })) ?? [],
    }
  },

  async get(userId: string, slug: string, jobId: string) {
    const { job } = await loadJob(userId, slug, jobId)
    return jobView(job)
  },

  async checkpoint(userId: string, slug: string, jobId: string, action: CheckpointAction) {
    const { job } = await loadJob(userId, slug, jobId)
    try {
      const { resume } = await applyCheckpointAction(prisma, job, action, mediaAiConfig)
      if (resume) await enqueue(job.id)
    } catch (err) {
      if (err instanceof CheckpointError) throw new AppError(err.message, err.status, err.code)
      throw err
    }
    return jobView(await prisma.mediaJob.findUniqueOrThrow({ where: { id: job.id } }))
  },

  async cancel(userId: string, slug: string, jobId: string) {
    const { job } = await loadJob(userId, slug, jobId)
    const claimed = await prisma.mediaJob.updateMany({
      where: { id: job.id, status: { in: [...ACTIVE_JOB_STATUSES] } },
      data: { status: "CANCELLED", checkpoint: null, failureReason: "Cancelled", finishedAt: new Date() },
    })
    if (claimed.count === 0) throw new AppError("This media run has already finished", 409, "MEDIA_JOB_FINISHED")
    const state = await refundUnspent(prisma, job, "AI media cancelled")
    await prisma.mediaJob.update({ where: { id: job.id }, data: { state: state as object } })
    return jobView(await prisma.mediaJob.findUniqueOrThrow({ where: { id: job.id } }))
  },
}

async function mediaBriefFor(projectId: string, userId: string, blueprint: NonNullable<ReturnType<typeof readBlueprint>>) {
  const recent = await prisma.mediaJob.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: "desc" },
    select: { mediaBrief: true },
    take: 10,
  })
  const brief = (recent.find((j) => j.mediaBrief && typeof j.mediaBrief === "object")?.mediaBrief ?? null) as Record<string, unknown> | null
  return brief ? { ...brief, blueprint: { narrative: blueprint.narrative.storyArc, visualSystem: blueprint.visualSystem } } : undefined
}
