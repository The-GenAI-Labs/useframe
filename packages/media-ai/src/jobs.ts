import { InsufficientCreditsError, refundCredits, RefundRejectedError, spendCredits, type prisma, type Prisma } from "@useframe/db"
import type { MediaBudgetTier, MediaMode } from "./constants.js"
import { budgetFor, type Budget, type MediaAiConfig } from "./config.js"
import { BLUEPRINT_ITEM_ID, estimateJobCost, maxCreditsForBudget, type CostItem } from "./cost.js"
import { emptyJobState, readJobState, type JobState } from "./jobState.js"
import type { MediaItem } from "./schemas.js"

export type JobDb = Pick<typeof prisma, "mediaJob" | "mediaGeneration" | "creditBalance" | "creditTransaction" | "$transaction">

export const ACTIVE_JOB_STATUSES = ["QUEUED", "RUNNING", "AWAITING_USER"] as const
const PROJECT_JOBS_PER_DAY = 5
const USER_ACTIVE_JOBS = 2

export type IneligibleReason =
  | "disabled"
  | "free"
  | "mode_off"
  | "no_budget"
  | "circuit_open"
  | "project_busy"
  | "project_daily_limit"
  | "user_busy"

export type Eligibility = { ok: true; budget: Budget } | { ok: false; reason: IneligibleReason }

export const chargeRef = (jobId: string) => `media:${jobId}`
export const itemRef = (jobId: string, itemId: string) => `media:${jobId}:${itemId}`

export async function isPaidUser(db: Pick<JobDb, "creditBalance">, userId: string): Promise<boolean> {
  const balance = await db.creditBalance.findUnique({ where: { userId }, select: { balance: true } })
  return (balance?.balance ?? 0) > 0
}

export async function circuitOpen(db: Pick<JobDb, "mediaGeneration">, config: MediaAiConfig, now = new Date()): Promise<boolean> {
  if (config.dailyCostCapUsd === null) return false
  const sum = await db.mediaGeneration.aggregate({
    where: { createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    _sum: { costUsd: true },
  })
  const spent = sum._sum.costUsd ?? 0
  if (spent > config.dailyCostCapUsd) {
    console.error(JSON.stringify({ level: "error", msg: "ALERT: media daily cost cap reached", spent, cap: config.dailyCostCapUsd }))
    return true
  }
  return false
}

export async function checkEligibility(
  db: JobDb,
  input: { userId: string; projectId: string; mediaMode: MediaMode; budgetTier: MediaBudgetTier; config: MediaAiConfig; now?: Date },
): Promise<Eligibility> {
  const { config } = input
  if (!config.enabled) return { ok: false, reason: "disabled" }
  if (input.mediaMode === "OFF") return { ok: false, reason: "mode_off" }
  if (!(await isPaidUser(db, input.userId))) return { ok: false, reason: "free" }
  const budget = budgetFor(config, input.budgetTier)
  if (budget.maxImages + budget.maxVideos <= 0) return { ok: false, reason: "no_budget" }
  if (await circuitOpen(db, config, input.now)) return { ok: false, reason: "circuit_open" }
  const now = input.now ?? new Date()
  const [projectActive, projectToday, userActive] = await Promise.all([
    db.mediaJob.count({ where: { projectId: input.projectId, status: { in: [...ACTIVE_JOB_STATUSES] } } }),
    db.mediaJob.count({ where: { projectId: input.projectId, createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
    db.mediaJob.count({ where: { userId: input.userId, status: { in: [...ACTIVE_JOB_STATUSES] } } }),
  ])
  if (projectActive > 0) return { ok: false, reason: "project_busy" }
  if (projectToday >= PROJECT_JOBS_PER_DAY) return { ok: false, reason: "project_daily_limit" }
  if (userActive >= USER_ACTIVE_JOBS) return { ok: false, reason: "user_busy" }
  return { ok: true, budget }
}

export const costItems = (items: readonly MediaItem[]): CostItem[] =>
  items.map((i) => ({ itemId: i.itemId, kind: i.kind, decision: i.decision, durationSec: i.video?.durationSec }))

export type JobPlan = {
  items: MediaItem[]
  dropped: { itemId: string; reason: string }[]
  budget: Budget
  budgetTier: MediaBudgetTier
}

export type CreateJobInput = {
  userId: string
  projectId: string
  mode: "AUTO" | "MANUAL"
  scope: { kind: "site" } | { kind: "slots"; slotIds: string[] }
  versionId: string | null
  // Known when the blueprint already ran; null when the job writes it itself.
  plan: JobPlan | null
  budget: Budget
  budgetTier: MediaBudgetTier
  mediaBrief?: unknown
  // The blueprint call is billed with the media credits whenever it runs for this job.
  chargeBlueprint: boolean
  config: MediaAiConfig
  enqueue: (jobId: string) => Promise<void>
  // Re-runs feed a version that already has a snapshot: its current media map.
  baseMedia?: Record<string, unknown>
}

// Creates the job, reserves its credits in one deduction and enqueues it. If
// the balance cannot cover the plan, nothing is kept and the error says how much is needed.
export async function createMediaJob(db: JobDb, input: CreateJobInput): Promise<{ jobId: string; reserved: number }> {
  const state = emptyJobState()
  let reserved: number
  if (input.plan) {
    const estimate = estimateJobCost(costItems(input.plan.items), input.config, { blueprint: input.chargeBlueprint })
    state.charges = estimate.perItem
    reserved = estimate.credits
  } else {
    reserved = maxCreditsForBudget(input.budget, input.config, { blueprint: input.chargeBlueprint })
    state.charges = { ...(input.chargeBlueprint ? { [BLUEPRINT_ITEM_ID]: input.config.credits.blueprint } : {}), unplanned: reserved - (input.chargeBlueprint ? input.config.credits.blueprint : 0) }
  }
  if (input.chargeBlueprint && input.plan) state.blueprintDone = true

  const job = await db.mediaJob.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      mode: input.mode,
      scope: input.scope as Prisma.InputJsonValue,
      versionId: input.versionId,
      ...(input.plan ? { plan: input.plan as unknown as Prisma.InputJsonValue } : { plan: { budget: input.budget, budgetTier: input.budgetTier } as Prisma.InputJsonValue }),
      ...(input.mediaBrief ? { mediaBrief: input.mediaBrief as Prisma.InputJsonValue } : {}),
      state: state as unknown as Prisma.InputJsonValue,
      ...(input.baseMedia ? { compiledAt: new Date(), compiledBindings: input.baseMedia as Prisma.InputJsonValue } : {}),
    },
    select: { id: true },
  })
  try {
    if (reserved > 0) {
      await spendCredits(db, { userId: input.userId, amount: reserved, reason: "AI media", refType: "MEDIA", refId: chargeRef(job.id) })
    }
  } catch (err) {
    await db.mediaJob.delete({ where: { id: job.id } }).catch(() => undefined)
    throw err
  }
  await db.mediaJob.update({ where: { id: job.id }, data: { creditsReserved: reserved } })
  await input.enqueue(job.id)
  return { jobId: job.id, reserved }
}

export { InsufficientCreditsError }

// Refunds one item's share once; calling it again is a no-op.
export async function refundItem(
  db: JobDb,
  job: { id: string; userId: string },
  state: JobState,
  itemId: string,
  reason: string,
): Promise<number> {
  const amount = state.charges[itemId] ?? 0
  if (amount <= 0 || state.settled[itemId]) return 0
  try {
    const result = await refundCredits(db as never, {
      userId: job.userId,
      refType: "MEDIA",
      refId: itemRef(job.id, itemId),
      reason,
      partial: { chargeRefId: chargeRef(job.id), amount },
    })
    state.settled[itemId] = "refunded"
    if (!result.alreadyRefunded) {
      await db.mediaJob.update({ where: { id: job.id }, data: { creditsRefunded: { increment: result.amount } } })
    }
    return result.alreadyRefunded ? 0 : result.amount
  } catch (err) {
    if (err instanceof RefundRejectedError) {
      state.settled[itemId] = "refunded"
      return 0
    }
    throw err
  }
}

// Partial adjustment of a reservation, e.g. the gap between the budget maximum and the real plan.
export async function refundAmount(
  db: JobDb,
  job: { id: string; userId: string },
  state: JobState,
  key: string,
  amount: number,
  reason: string,
): Promise<number> {
  if (amount <= 0) return 0
  state.charges[key] = amount
  return refundItem(db, job, state, key, reason)
}

export async function refundUnspent(db: JobDb, job: { id: string; userId: string; state: unknown }, reason: string): Promise<JobState> {
  const state = readJobState(job.state)
  for (const itemId of Object.keys(state.charges)) {
    if (state.settled[itemId]) continue
    const item = state.items[itemId]
    if (item && item.status === "DONE") continue
    if (itemId === BLUEPRINT_ITEM_ID && state.blueprintDone) continue
    await refundItem(db, job, state, itemId, reason)
  }
  return state
}

// Reserves a user-requested regeneration as its own charged item.
export async function reserveExtra(
  db: JobDb,
  job: { id: string; userId: string },
  state: JobState,
  key: string,
  amount: number,
): Promise<void> {
  if (amount <= 0) return
  await spendCredits(db, { userId: job.userId, amount, reason: "AI media regeneration", refType: "MEDIA", refId: chargeRef(job.id) })
  state.charges[key] = amount
  await db.mediaJob.update({ where: { id: job.id }, data: { creditsReserved: { increment: amount } } })
}

export function scopeOf(value: unknown): CreateJobInput["scope"] {
  const v = value as { kind?: string; slotIds?: unknown } | null
  return v?.kind === "slots" && Array.isArray(v.slotIds) ? { kind: "slots", slotIds: v.slotIds.filter((s): s is string => typeof s === "string") } : { kind: "site" }
}

type ResultDb = JobDb & Pick<typeof prisma, "projectVersion" | "project">

const PENDING_RESULT = "pending"

// Applies a finished job's bindings to a new version, at most once: generation
// and the worker may both reach this point and only the claim winner writes.
export async function applyJobResult(
  db: ResultDb,
  jobId: string,
  apply: (input: { projectId: string; baseVersionId: string; bindings: Record<string, unknown>; onlySlots?: string[]; label: string }) => Promise<{ versionId: string } | null>,
): Promise<string | null> {
  const job = await db.mediaJob.findUnique({
    where: { id: jobId },
    select: { projectId: true, versionId: true, status: true, bindings: true, scope: true, resultVersionId: true, compiledAt: true, compiledBindings: true },
  })
  if (!job?.versionId || job.status !== "DONE" || job.resultVersionId) return job?.resultVersionId ?? null
  if (!job.compiledAt) return null
  const bindings = (job.bindings ?? {}) as Record<string, unknown>
  if (JSON.stringify(bindings) === JSON.stringify(job.compiledBindings ?? null)) {
    await db.mediaJob.updateMany({ where: { id: jobId, resultVersionId: null }, data: { resultVersionId: job.versionId } })
    return job.versionId
  }
  const claim = await db.mediaJob.updateMany({ where: { id: jobId, resultVersionId: null }, data: { resultVersionId: PENDING_RESULT } })
  if (claim.count === 0) return null
  const scope = scopeOf(job.scope)
  try {
    const result = await apply({
      projectId: job.projectId,
      baseVersionId: job.versionId,
      bindings,
      ...(scope.kind === "slots" ? { onlySlots: scope.slotIds } : {}),
      label: "Media added",
    })
    await db.mediaJob.update({ where: { id: jobId }, data: { resultVersionId: result?.versionId ?? job.versionId } })
    return result?.versionId ?? null
  } catch (err) {
    await db.mediaJob.update({ where: { id: jobId }, data: { resultVersionId: null } })
    throw err
  }
}

// Called by generation after it wrote the version's snapshot with `used` bindings.
export async function markCompiled(db: JobDb, jobId: string, used: Record<string, unknown>): Promise<void> {
  await db.mediaJob.update({
    where: { id: jobId },
    data: { compiledAt: new Date(), compiledBindings: used as Prisma.InputJsonValue },
  })
}
