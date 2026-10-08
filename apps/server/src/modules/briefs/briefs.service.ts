import {
  prisma,
  writeBriefFields,
  briefStateOf,
  latestBriefRevision,
  BriefConflictError,
  BriefNotFoundError,
  type BriefRow,
  type Prisma,
} from "@useframe/db"
import {
  BRIEF_CATALOG_VERSION,
  BRIEF_IDEA_PREFILL_MIN_CHARS,
  BriefWriteError,
  composeRawIdea,
  computeWarnings,
  dropUnconfirmedImportedProof,
  hasControlChars,
  isFieldId,
  isHttpsUrl,
  omittedSections,
  unconfirmedClaims,
  validateFieldValue,
  validateForSubmit,
  type ApproveBriefInput,
  type BriefData,
  type BriefDraftSummary,
  type BriefResolution,
  type BriefStepPointer,
  type BriefUploadField,
  type BriefView,
  type CreateBriefInput,
  type CreateProjectInput,
  type FieldId,
  type PatchBriefInput,
  type PrefillBriefInput,
  type ProjectInputType,
} from "@repo/schemas"
import { BUILDER_CAPABILITIES } from "@repo/site-builder"
import { env } from "@/config/env.js"
import { redis } from "@/lib/redis.js"
import { signAccessToken } from "@/lib/jwt.js"
import { callBriefPrefill, callBriefResolve } from "@/lib/orchestrator.js"
import { AppError } from "@/middleware/errorHandler.js"
import { ProjectsService } from "@/modules/projects/projects.service.js"
import { BriefUploadsService } from "./briefUploads.service.js"

type AuthUser = { id: string; email: string; plan: string }

const RESOLVE_LOCK_SECONDS = 90
const RESOLVE_STALE_MS = 90_000

// Translates the db/schemas brief errors into the API's error format.
export function toAppError(err: unknown): unknown {
  if (err instanceof BriefWriteError) {
    return new AppError(err.message, err.status, err.status === 413 ? "BRIEF_TOO_LARGE" : "BRIEF_INVALID", {
      errors: err.errors,
    })
  }
  if (err instanceof BriefConflictError) {
    return new AppError("This brief changed somewhere else", 409, "BRIEF_CONFLICT", { data: toView(err.current, null) })
  }
  if (err instanceof BriefNotFoundError) return new AppError("Brief not found", 404)
  return err
}

function resolutionOf(row: Pick<BriefRow, "resolution">): BriefResolution {
  return (row.resolution ?? {}) as BriefResolution
}

export function toView(
  row: BriefRow,
  revision: { id: string; version: number; reason: string; createdAt: Date } | null,
): BriefView {
  const state = briefStateOf(row)
  const resolution = resolutionOf(row)
  const logo = state.data.logo
  return {
    id: row.id,
    projectId: row.projectId,
    status: row.status,
    mode: row.mode,
    currentStep: (row.currentStep as BriefStepPointer | null) ?? null,
    version: row.version,
    catalogVersion: row.catalogVersion,
    data: state.data,
    meta: state.meta,
    warnings: computeWarnings(state.data, BUILDER_CAPABILITIES),
    omitted: omittedSections(state.data, resolution.dropped ?? []),
    needsConfirmation: unconfirmedClaims(state),
    resolution,
    uploads: {
      ...(logo ? { logo: { url: BriefUploadsService.signedPath(logo.uploadId) } } : {}),
      ...(state.data.sourceDocument ? { sourceDocument: { name: state.data.sourceDocument.name } } : {}),
    },
    latestRevision: revision
      ? { id: revision.id, version: revision.version, reason: revision.reason, createdAt: revision.createdAt.toISOString() }
      : null,
    lastPrefillAt: row.lastPrefillAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function viewOf(row: BriefRow): Promise<BriefView> {
  return toView(row, row.projectId ? await latestBriefRevision(row.id) : null)
}

async function findDraft(userId: string, briefId: string): Promise<BriefRow> {
  const brief = await prisma.projectBrief.findFirst({ where: { id: briefId, userId } })
  if (!brief) throw new AppError("Brief not found", 404)
  return brief
}

async function findProjectBrief(userId: string, slug: string) {
  const project = await prisma.project.findFirst({
    where: { slug, userId, deletedAt: null },
    select: { id: true, currentVersionId: true },
  })
  if (!project) throw new AppError("Project not found", 404)
  const brief = await prisma.projectBrief.findFirst({ where: { projectId: project.id, userId } })
  if (!brief) throw new AppError("This project has no brief", 404)
  return { project, brief }
}

export function deriveInputType(data: BriefData): ProjectInputType {
  if (data.existingUrl) return "FROM_OWN_SITE"
  if (data.designReferences?.some((r) => r.redesignFrom)) return "FROM_COMPETITOR"
  return "FROM_SCRATCH"
}

function sourceUrlOf(data: BriefData): string | undefined {
  return data.existingUrl ?? data.designReferences?.find((r) => r.redesignFrom)?.url
}

// Keeps the Project columns older code reads (startupIdea, targetAudience,
// niche, ...) derived from the brief, so the two never drift.
export async function syncProjectFromBrief(projectId: string, data: BriefData, userNiche: boolean): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { currentVersionId: true },
  })
  await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(data.productName ? { name: data.productName } : {}),
      startupIdea: composeRawIdea(data),
      ...(data.audienceDescription ? { targetAudience: data.audienceDescription } : {}),
      ...(userNiche && data.niche ? { niche: data.niche } : {}),
      sourceUrl: sourceUrlOf(data) ?? null,
      inputType: deriveInputType(data),
      ...(data.tone?.length ? { brandPersonality: data.tone.join(", ").toLowerCase() } : {}),
      businessModel: data.productType ?? null,
    },
  })
  if (project?.currentVersionId && data.siteType && data.siteType !== "AI_DECIDES") {
    await prisma.projectVersion.updateMany({
      where: { id: project.currentVersionId, snapshot: { equals: {} } },
      data: { siteType: data.siteType },
    })
  }
}

function stripControl(value: string, max: number): string {
  return [...value]
    .filter((ch) => !hasControlChars(ch, true))
    .join("")
    .slice(0, max)
}

async function kickResolve(briefId: string, user: AuthUser): Promise<void> {
  const lockKey = `brief:resolve:${briefId}`
  const acquired = await redis.set(lockKey, "1", "EX", RESOLVE_LOCK_SECONDS, "NX")
  if (!acquired) return
  try {
    await callBriefResolve(briefId, signAccessToken({ id: user.id, email: user.email, plan: user.plan }))
  } catch (err) {
    console.error(`[briefs] resolve call failed brief=${briefId}:`, err instanceof Error ? err.message : "unknown")
    // Resolving must never block a project: fall back to review with nothing assumed.
    await prisma.projectBrief.updateMany({
      where: { id: briefId, status: "RESOLVING" },
      data: {
        status: "AWAITING_REVIEW",
        resolution: { notice: "resolve_failed" } as Prisma.InputJsonValue,
      },
    })
  } finally {
    await redis.del(lockKey)
  }
}

function startResolve(briefId: string, user: AuthUser): void {
  void kickResolve(briefId, user).catch((err) =>
    console.error(`[briefs] resolve kick failed brief=${briefId}:`, err instanceof Error ? err.message : "unknown"),
  )
}

export const BriefsService = {
  async listOpenDrafts(userId: string): Promise<BriefDraftSummary[]> {
    const drafts = await prisma.projectBrief.findMany({
      where: { userId, projectId: null, status: "DRAFT" },
      orderBy: { updatedAt: "desc" },
      take: env.BRIEF_MAX_OPEN_DRAFTS + 5,
      select: { id: true, data: true, currentStep: true, updatedAt: true },
    })
    return drafts.map((d) => ({
      id: d.id,
      productName: ((d.data ?? {}) as BriefData).productName ?? null,
      currentStep: (d.currentStep as BriefStepPointer | null) ?? null,
      updatedAt: d.updatedAt.toISOString(),
    }))
  },

  async createDraft(user: AuthUser, input: CreateBriefInput): Promise<{ brief: BriefView; prefillSuggested: boolean }> {
    const open = await prisma.projectBrief.count({ where: { userId: user.id, projectId: null, status: "DRAFT" } })
    if (open >= env.BRIEF_MAX_OPEN_DRAFTS) {
      throw new AppError("You already have open drafts", 409, "BRIEF_DRAFT_LIMIT", {
        data: { drafts: await this.listOpenDrafts(user.id) },
      })
    }

    const created = await prisma.projectBrief.create({
      data: {
        userId: user.id,
        catalogVersion: BRIEF_CATALOG_VERSION,
        mode: input.mode ?? "QUICK",
        currentStep: "start",
      },
    })

    const idea = input.ideaText ? stripControl(input.ideaText, 2000).trim() : ""
    const seedsOneLiner = idea.length > 0 && idea.length <= 300

    await writeBriefFields({
      briefId: created.id,
      changes: { set: { contactEmail: user.email } },
      source: "default",
    }).catch((err) => {
      if (!(err instanceof BriefWriteError)) throw err
    })
    const { brief } = seedsOneLiner
      ? await writeBriefFields({ briefId: created.id, changes: { set: { oneLiner: idea } }, source: "user" })
      : { brief: await prisma.projectBrief.findUniqueOrThrow({ where: { id: created.id } }) }

    return { brief: await viewOf(brief), prefillSuggested: idea.length >= BRIEF_IDEA_PREFILL_MIN_CHARS }
  },

  async get(userId: string, briefId: string): Promise<BriefView> {
    return viewOf(await findDraft(userId, briefId))
  },

  async patchDraft(userId: string, briefId: string, input: PatchBriefInput): Promise<BriefView> {
    const brief = await findDraft(userId, briefId)
    if (brief.projectId || brief.status !== "DRAFT") {
      throw new AppError("This brief belongs to a project; edit it from the project", 409, "BRIEF_ATTACHED")
    }
    try {
      const result = await writeBriefFields({
        briefId,
        userId,
        expectedVersion: input.expectedVersion,
        changes: { set: input.set, unset: input.unset, aiDecide: input.aiDecide },
        source: "user",
        columns: {
          ...(input.mode ? { mode: input.mode } : {}),
          ...(input.currentStep ? { currentStep: input.currentStep } : {}),
        },
      })
      return viewOf(result.brief)
    } catch (err) {
      throw toAppError(err)
    }
  },

  async deleteDraft(userId: string, briefId: string): Promise<void> {
    const result = await prisma.projectBrief.deleteMany({ where: { id: briefId, userId, projectId: null } })
    if (result.count === 0) throw new AppError("Brief not found", 404)
  },

  async prefill(
    user: AuthUser,
    briefId: string,
    input: PrefillBriefInput,
    signal: AbortSignal,
  ): Promise<{ brief: BriefView; filled: FieldId[] }> {
    const brief = await findDraft(user.id, briefId)
    if (brief.status !== "DRAFT") throw new AppError("Pre-fill is only available while drafting", 409)

    if (input.kind === "doc") {
      const upload = await prisma.briefUpload.findFirst({
        where: { id: input.uploadId, briefId, userId: user.id, field: "sourceDocument" },
        select: { id: true },
      })
      if (!upload) throw new AppError("Upload not found", 404)
    }
    const payload =
      input.kind === "text"
        ? { briefId, kind: "text" as const, text: input.text.slice(0, env.BRIEF_PREFILL_MAX_CHARS) }
        : input.kind === "url"
          ? { briefId, kind: "url" as const, url: input.url }
          : { briefId, kind: "doc" as const, uploadId: input.uploadId }

    const timeout = AbortSignal.timeout(env.BRIEF_PREFILL_TIMEOUT_MS)
    let result: Awaited<ReturnType<typeof callBriefPrefill>>
    try {
      result = await callBriefPrefill(
        payload,
        signAccessToken({ id: user.id, email: user.email, plan: user.plan }),
        AbortSignal.any([signal, timeout]),
      )
    } catch (err) {
      if (timeout.aborted) throw new AppError("Reading that took too long", 504, "PREFILL_TIMEOUT")
      if (signal.aborted) throw new AppError("Cancelled", 499, "PREFILL_CANCELLED")
      throw err
    }

    // Drop values the catalog rejects one by one rather than failing the
    // whole suggestion set on a single bad value.
    const set: Record<string, unknown> = {}
    const confidence: Partial<Record<FieldId, number>> = {}
    const excerpts: Partial<Record<FieldId, string>> = {}
    for (const [field, value] of Object.entries(result.values)) {
      if (!isFieldId(field) || !validateFieldValue(field, value, "draft").ok) continue
      set[field] = value
      confidence[field] = result.confidence[field] ?? 0.5
      if (result.excerpts[field]) excerpts[field] = result.excerpts[field]
    }
    try {
      const write = await writeBriefFields({
        briefId,
        userId: user.id,
        changes: { set },
        source: "imported",
        confidence,
        excerpts,
        columns: { lastPrefillAt: new Date() },
      })
      return { brief: await viewOf(write.brief), filled: write.changed }
    } catch (err) {
      throw toAppError(err)
    }
  },

  async storeUpload(userId: string, briefId: string, field: BriefUploadField, name: string | undefined, body: Buffer): Promise<BriefView> {
    const brief = await findDraft(userId, briefId)
    if (brief.status === "RESOLVING") throw new AppError("Your brief is still being read", 409)
    const stored = await BriefUploadsService.store({ userId, briefId, field, name, body })
    try {
      const value =
        field === "logo"
          ? { uploadId: stored.uploadId, mime: stored.mime, width: stored.width, height: stored.height }
          : { uploadId: stored.uploadId, mime: stored.mime, name: stored.name, size: stored.size }
      const result = await writeBriefFields({
        briefId,
        userId,
        changes: { set: { [field]: value } },
        source: "user",
        ...(brief.projectId ? { revisionReason: "EDITED" as const, mode: "submit" as const, strictProof: true } : {}),
      })
      return viewOf(result.brief)
    } catch (err) {
      throw toAppError(err)
    }
  },

  async storeUploadForProject(userId: string, slug: string, field: BriefUploadField, name: string | undefined, body: Buffer): Promise<BriefView> {
    const { brief } = await findProjectBrief(userId, slug)
    return this.storeUpload(userId, brief.id, field, name, body)
  },

  // POST /api/projects { briefId }: validates the draft, runs the existing
  // project creation (and with it the unchanged free-tier/credit gate),
  // attaches the brief and starts the resolver.
  async createProjectFromBrief(user: AuthUser, briefId: string) {
    const brief = await prisma.projectBrief.findFirst({ where: { id: briefId, userId: user.id } })
    if (!brief) throw new AppError("Brief not found", 404)
    if (brief.projectId || brief.status !== "DRAFT") throw new AppError("This brief already has a project", 409)

    const cleaned = dropUnconfirmedImportedProof(briefStateOf(brief))
    const unset: string[] = [...cleaned.dropped.filter((f) => f !== "pricing")]
    if (cleaned.data.launchDate && cleaned.data.availability !== "LAUNCHING_SOON") {
      delete cleaned.data.launchDate
      unset.push("launchDate")
    }
    const valid = validateForSubmit(cleaned.data)
    if (!valid.ok) {
      throw new AppError("Some answers need attention", 422, "BRIEF_INVALID", { errors: valid.errors })
    }

    const data = cleaned.data
    const userNiche = briefStateOf(brief).meta.niche?.source === "user"
    const createInput: CreateProjectInput = {
      name: data.productName!,
      startupIdea: composeRawIdea(data),
      niche: userNiche && data.niche ? data.niche : "OTHER",
      targetAudience: data.audienceDescription!,
      inputType: deriveInputType(data),
      sourceUrl: sourceUrlOf(data),
      siteType: data.siteType && data.siteType !== "AI_DECIDES" ? data.siteType : undefined,
    }

    const created = await ProjectsService.createProject(user.id, createInput)

    try {
      await writeBriefFields({
        briefId,
        userId: user.id,
        changes: {
          unset,
          ...(cleaned.dropped.includes("pricing") ? { set: { pricing: data.pricing } } : {}),
        },
        source: "user",
        mode: "submit",
        strictProof: true,
        columns: { project: { connect: { id: created.project.id } }, status: "RESOLVING", currentStep: "summary" },
      })
    } catch (err) {
      throw toAppError(err)
    }
    await syncProjectFromBrief(created.project.id, data, userNiche)
    startResolve(briefId, user)

    return { ...created, briefId }
  },

  // Legacy POST /projects body: a minimal brief so every project has one.
  async createLegacyBrief(userId: string, projectId: string, input: CreateProjectInput): Promise<void> {
    const brief = await prisma.projectBrief.create({
      data: {
        userId,
        projectId,
        catalogVersion: BRIEF_CATALOG_VERSION,
        status: "APPROVED",
        approvedAt: new Date(),
        resolution: { origin: "legacy" } as Prisma.InputJsonValue,
      },
    })
    const set: Record<string, unknown> = {
      productName: stripControl(input.name, 80),
      oneLiner: stripControl(input.ideaText ?? input.startupIdea, 300),
      audienceDescription: stripControl(input.targetAudience, 300),
      niche: input.niche,
      ...(input.siteType ? { siteType: input.siteType } : {}),
    }
    if (input.sourceUrl && isHttpsUrl(input.sourceUrl)) {
      if (input.inputType === "FROM_OWN_SITE") set.existingUrl = input.sourceUrl
      if (input.inputType === "FROM_COMPETITOR") set.designReferences = [{ url: input.sourceUrl, redesignFrom: true }]
    }
    try {
      await writeBriefFields({ briefId: brief.id, changes: { set }, source: "user", revisionReason: "APPROVED" })
    } catch (err) {
      console.error(`[briefs] legacy brief seed skipped brief=${brief.id}:`, err instanceof Error ? err.name : "unknown")
    }
  },

  async getForProject(user: AuthUser, slug: string): Promise<BriefView> {
    const { brief } = await findProjectBrief(user.id, slug)
    if (brief.status === "RESOLVING" && Date.now() - brief.updatedAt.getTime() > RESOLVE_STALE_MS) {
      startResolve(brief.id, user)
    }
    return viewOf(brief)
  },

  async patchForProject(user: AuthUser, slug: string, input: PatchBriefInput): Promise<{ brief: BriefView; regenerateNeeded: boolean }> {
    const { project, brief } = await findProjectBrief(user.id, slug)
    if (brief.status === "RESOLVING") throw new AppError("Your brief is still being read", 409, "BRIEF_RESOLVING")

    try {
      const result = await writeBriefFields({
        briefId: brief.id,
        userId: user.id,
        expectedVersion: input.expectedVersion,
        changes: { set: input.set, unset: input.unset, aiDecide: input.aiDecide },
        source: "user",
        mode: "submit",
        strictProof: true,
        revisionReason: "EDITED",
        columns: {
          ...(input.mode ? { mode: input.mode } : {}),
          ...(input.currentStep ? { currentStep: input.currentStep } : {}),
          // An edited legacy brief now carries the user's answers, so the
          // pipeline switches to reading it.
          ...(resolutionOf(brief).origin === "legacy"
            ? { resolution: { ...resolutionOf(brief), origin: undefined } as Prisma.InputJsonValue }
            : {}),
        },
      })
      const state = briefStateOf(result.brief)
      await syncProjectFromBrief(project.id, state.data, state.meta.niche?.source === "user")
      const generated = await prisma.projectVersion.count({
        where: { projectId: project.id, NOT: { snapshot: { equals: {} } } },
      })
      return { brief: await viewOf(result.brief), regenerateNeeded: generated > 0 }
    } catch (err) {
      throw toAppError(err)
    }
  },

  async approveForProject(user: AuthUser, slug: string, input: ApproveBriefInput): Promise<BriefView> {
    const { project, brief } = await findProjectBrief(user.id, slug)
    if (brief.status === "APPROVED") return viewOf(brief)
    if (brief.status !== "AWAITING_REVIEW") throw new AppError("Your brief is still being read", 409, "BRIEF_RESOLVING")

    const state = briefStateOf(brief)
    const pending = unconfirmedClaims(state)
    const confirm = pending.filter((p) => input.confirmedPaths.includes(p))
    const missing = pending.filter((p) => !confirm.includes(p))
    if (missing.length > 0) {
      throw new AppError("Confirm or remove each claim before approving", 422, "BRIEF_UNCONFIRMED_CLAIMS", {
        errors: Object.fromEntries(missing.map((p) => [p, ["Confirm or remove this claim"]])),
      })
    }

    try {
      const result = await writeBriefFields({
        briefId: brief.id,
        userId: user.id,
        expectedVersion: input.expectedVersion,
        changes: { confirm },
        source: "user",
        revisionReason: "APPROVED",
        columns: { status: "APPROVED", approvedAt: new Date() },
      })
      await prisma.pipelineLog
        .create({
          data: {
            projectId: project.id,
            jobId: `brief:${brief.id}:approved:${result.brief.version}`,
            stage: "RESEARCH",
            status: "brief:APPROVED",
          },
        })
        .catch(() => {})
      return viewOf(result.brief)
    } catch (err) {
      throw toAppError(err)
    }
  },
}
