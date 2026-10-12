import { randomUUID } from "node:crypto"
import { briefStateOf, type Prisma } from "@useframe/db"
import type { SiteSpec } from "@repo/schemas"
import {
  applyJobResult,
  applyMediaBindings,
  buildMediaBrief,
  callJson,
  checkConceptSet,
  CHECKPOINT_TTL_MS,
  conceptsPrompt,
  ConceptSetSchema,
  costItems,
  estimateJobCost,
  framesPrompt,
  FramePromptsSchema,
  imagePromptsPrompt,
  ImagePromptBatchSchema,
  imageQaPrompt,
  ImageQaSchema,
  isBlueprintFresh,
  isPaidUser,
  judgePrompt,
  JudgeOutputSchema,
  lintPrompt,
  loadBlueprintInputs,
  LlmRefusalError,
  LlmValidationError,
  MediaBriefSchema,
  paletteOf,
  planningSlots,
  PromptRewriteSchema,
  ProviderError,
  readBlueprint,
  readJobState,
  refundAmount,
  refundItem,
  refundUnspent,
  requestKey,
  revisePrompt,
  runSiteBlueprint,
  scopeOf,
  selectWinner,
  softenPrompt,
  stillSize,
  videoFrameSize,
  videoPromptPrompt,
  VideoPromptSchema,
  videoQaPrompt,
  VideoQaSchema,
  zodParse,
  type Checkpoint,
  type ItemStage,
  type ItemState,
  type JobPlan,
  type JobState,
  type Llm,
  type LlmImage,
  type MediaBindingOut,
  type MediaBrief,
  type PromptPair,
  type RoutingKey,
  type Substep,
  type VisualSystem,
} from "@repo/media-ai"
import { errorMessage, log, metric } from "@/lib/logger.js"
import { localSemaphore } from "@/lib/semaphore.js"
import { analyzeImage, generateImage, overlayHint, updateAsset, variantBytes, waitForAsset } from "./assets.js"
import type { GenerateDeps } from "./deps.js"

type JobRow = {
  id: string
  projectId: string
  userId: string
  mode: "AUTO" | "MANUAL"
  status: string
  versionId: string | null
  scope: unknown
  plan: unknown
  mediaBrief: unknown
  state: unknown
  bindings: unknown
  creditsReserved: number
}

type SlotRef = ReturnType<typeof planningSlots>[number]

type Ctx = {
  deps: GenerateDeps
  job: JobRow
  state: JobState
  brief: MediaBrief
  visualSystem: VisualSystem
  palette: string[]
  slots: Map<string, SlotRef>
  forbidden: string[]
  bindings: Record<string, MediaBindingOut>
  save: () => Promise<void>
  stage: (substep: Substep) => void
  cancelled: () => Promise<boolean>
}

const PHASE: Record<ItemStage, number> = { CONCEPTS: 1, SELECT: 1, FRAMES: 2, IMG_QA: 2, VIDEO_PROMPT: 3, VIDEO: 3, VID_QA: 3 }
const CHECKPOINT_AFTER: [number, Checkpoint][] = [
  [1, "CONCEPT_PICK"],
  [2, "IMAGES_APPROVE"],
  [3, "VIDEO_APPROVE"],
]
const TERMINAL = new Set(["DONE", "FAILED", "DROPPED", "SKIPPED"])
const MAX_IMAGE_ATTEMPTS = 3

class ItemFailure extends Error {}

const json = (v: unknown) => v as Prisma.InputJsonValue

// ---------------------------------------------------------------- LLM with an audit trail

function auditedLlm(ctx: Pick<Ctx, "deps" | "job">, itemId: string, stage: string): Llm {
  return {
    async complete(req) {
      const started = Date.now()
      const row = await ctx.deps.db.mediaGeneration.create({
        data: {
          jobId: ctx.job.id,
          itemId,
          stage,
          kind: "llm",
          provider: "anthropic",
          model: req.routingKey,
          requestKey: requestKey(ctx.job.id, stage, itemId, Date.now()) + randomUUID().slice(0, 8),
          status: "RUNNING",
        },
        select: { id: true },
      })
      try {
        const res = await ctx.deps.llm.complete(req)
        const cost = res.costUsd ?? ctx.deps.config.ai.providerCostUsd.llmCall
        await ctx.deps.db.mediaGeneration.update({
          where: { id: row.id },
          data: { status: res.refused ? "REFUSED" : "SUCCEEDED", costUsd: cost, latencyMs: Date.now() - started },
        })
        await ctx.deps.db.mediaJob.update({ where: { id: ctx.job.id }, data: { costUsd: { increment: cost } } })
        return res
      } catch (err) {
        await ctx.deps.db.mediaGeneration.update({ where: { id: row.id }, data: { status: "FAILED", error: errorMessage(err).slice(0, 500), latencyMs: Date.now() - started } })
        throw err
      }
    },
  }
}

function ask<T>(ctx: Ctx, itemId: string, stage: string, purpose: string, key: RoutingKey, pair: PromptPair, parse: (raw: unknown) => { ok: true; value: T } | { ok: false; errors: string[] }, images?: LlmImage[]) {
  return callJson(auditedLlm(ctx, itemId, stage), { routingKey: key, system: pair.system, prompt: pair.prompt, purpose, ...(images ? { images } : {}) }, parse).then((r) => r.value)
}

const png = (bytes: Buffer): LlmImage => ({ mime: "image/png", base64: bytes.toString("base64") })
const webp = (bytes: Buffer): LlmImage => ({ mime: "image/webp", base64: bytes.toString("base64") })

async function safePrompt(ctx: Ctx, itemId: string, prompt: string): Promise<string> {
  const issues = lintPrompt(prompt, ctx.forbidden)
  if (issues.length === 0) return prompt
  const { prompt: rewritten } = await ask(ctx, itemId, "LINT", "media.revise", "media-creative", revisePrompt({ prompt, fix: "Remove the flagged content.", reason: issues.join("; ") }), zodParse(PromptRewriteSchema))
  if (lintPrompt(rewritten, ctx.forbidden).length) throw new ItemFailure("The prompt could not be made safe")
  return rewritten
}

// ---------------------------------------------------------------- images

async function generatedAsset(
  ctx: Ctx,
  s: ItemState,
  stage: string,
  attempt: number,
  call: { prompt: string; target: { width: number; height: number }; edit?: Buffer[] },
  extra: { purpose: string; conceptId?: string; mechanism?: string; role: string },
): Promise<{ assetId: string; bytes: Buffer }> {
  const key = requestKey(ctx.job.id, stage, s.item.itemId, attempt)
  const done = await ctx.deps.db.mediaGeneration.findUnique({ where: { requestKey: key }, select: { status: true, outputAssetId: true } })
  if (done?.status === "SUCCEEDED" && done.outputAssetId) {
    const bytes = await originalBytes(ctx, done.outputAssetId)
    if (bytes) return { assetId: done.outputAssetId, bytes }
  }
  const started = Date.now()
  const row = done
    ? await ctx.deps.db.mediaGeneration.update({ where: { requestKey: key }, data: { status: "RUNNING", error: null }, select: { id: true } })
    : await ctx.deps.db.mediaGeneration.create({
        data: { jobId: ctx.job.id, itemId: s.item.itemId, stage, kind: "image", provider: "openai", model: "image", attempt, requestKey: key, status: "RUNNING", promptText: call.prompt.slice(0, 8000) },
        select: { id: true },
      })
  try {
    const image = await generateImage(ctx.deps, { prompt: call.prompt, target: call.target, requestKey: key, edit: call.edit })
    const { assetId } = await ctx.deps.createAsset({
      projectId: ctx.job.projectId,
      userId: ctx.job.userId,
      kind: "IMAGE",
      origin: "GENERATED",
      mime: "image/png",
      purpose: extra.purpose,
      title: `${s.item.role} (${s.item.itemId})`.slice(0, 120),
      generation: json({
        jobId: ctx.job.id,
        itemId: s.item.itemId,
        conceptId: extra.conceptId ?? null,
        mechanism: extra.mechanism ?? null,
        provider: "openai",
        model: image.model,
        size: image.size,
        summary: s.item.subjectDirection,
        researchFindingIds: ctx.brief.researchFindingIds,
      }),
      options: { skipDescribe: true },
      bytes: image.bytes,
    })
    if ((await waitForAsset(ctx.deps, assetId)) !== "READY") throw new ItemFailure("The generated image could not be processed")
    await ctx.deps.db.mediaGeneration.update({
      where: { id: row.id },
      data: { status: "SUCCEEDED", outputAssetId: assetId, model: image.model, costUsd: image.costUsd, latencyMs: Date.now() - started },
    })
    await ctx.deps.db.mediaJob.update({ where: { id: ctx.job.id }, data: { costUsd: { increment: image.costUsd } } })
    return { assetId, bytes: image.bytes }
  } catch (err) {
    const refused = err instanceof ProviderError && err.kind === "REFUSED"
    await ctx.deps.db.mediaGeneration.update({ where: { id: row.id }, data: { status: refused ? "REFUSED" : "FAILED", error: errorMessage(err).slice(0, 1000), latencyMs: Date.now() - started } })
    throw err
  }
}

async function originalBytes(ctx: Ctx, assetId: string): Promise<Buffer | null> {
  const asset = await ctx.deps.db.mediaAsset.findUnique({ where: { id: assetId }, select: { originalKey: true } })
  return asset ? ctx.deps.store.getBuffer(asset.originalKey, 50 * 1024 * 1024) : null
}

async function referenceImages(ctx: Ctx, s: ItemState): Promise<Buffer[]> {
  const out: Buffer[] = []
  for (const id of s.item.referenceAssetIds ?? []) {
    const bytes = await variantBytes(ctx.deps, id, "fallback")
    if (bytes) out.push(bytes)
  }
  return out
}

type QaVerdict = { pass: boolean; altText: string; fix?: string; reasons: string }

async function qaImage(ctx: Ctx, s: ItemState, assetId: string, bytes: Buffer, opts: { intent: string; ending?: Buffer }): Promise<QaVerdict & { overlay: "none" | "light" | "dark" }> {
  const slot = ctx.slots.get(s.item.slotId)!.slot
  const zone = s.item.textSafeZone ?? "left"
  const analysis = await analyzeImage(bytes, ctx.palette, zone)
  const view = (await variantBytes(ctx.deps, assetId, "w960")) ?? bytes
  const images = [view.subarray(0, 4).toString("hex") === "89504e47" ? png(view) : webp(view)]
  if (opts.ending) images.push(png(opts.ending))
  const qa = await ask(
    ctx,
    s.item.itemId,
    "IMG_QA",
    "media.image_qa",
    "media-vision",
    imageQaPrompt({ intent: opts.intent, palette: ctx.palette, analysis, isEnding: !!opts.ending, allowPeople: !!s.item.allowPeople, textSafeZone: zone }),
    zodParse(ImageQaSchema),
    images,
  )
  const hero = slot.priority === "hero"
  const reasons = [
    !qa.matchesIntent && "does not match the intent",
    qa.hasReadableText && "has readable text",
    qa.hasLogoOrBrand && "shows a logo or brand",
    qa.hasDistortion && "has distortion",
    !qa.safe && "is not safe",
    qa.paletteAdherence < 3 && "ignores the palette",
    qa.hasRealisticPerson && !s.item.allowPeople && "shows a realistic person",
    hero && !qa.textZoneClear && "the headline area is busy",
    opts.ending && (qa.identityMatchesOpening ?? 0) < 4 && "does not match the opening frame",
  ].filter(Boolean) as string[]
  await updateAsset(ctx.deps, assetId, {
    generation: json({ ...(await currentGeneration(ctx, assetId)), analysis }),
  })
  return { pass: reasons.length === 0, altText: qa.altText, fix: qa.promptFix, reasons: reasons.join(", "), overlay: overlayHint(analysis, slot.defaultOverlay) }
}

async function currentGeneration(ctx: Ctx, assetId: string): Promise<Record<string, unknown>> {
  const a = await ctx.deps.db.mediaAsset.findUnique({ where: { id: assetId }, select: { generation: true } })
  return (a?.generation as Record<string, unknown> | null) ?? {}
}

async function revise(ctx: Ctx, itemId: string, prompt: string, fix: string | undefined, reasons: string): Promise<string> {
  const { prompt: next } = await ask(ctx, itemId, "REVISE", "media.revise", "media-creative", revisePrompt({ prompt, fix: fix ?? "Fix the reported problems.", reason: reasons }), zodParse(PromptRewriteSchema))
  return safePrompt(ctx, itemId, next)
}

async function discard(ctx: Ctx, assetId: string): Promise<void> {
  await ctx.deps.db.mediaAsset.updateMany({ where: { id: assetId, deletedAt: null }, data: { deletedAt: new Date() } })
}

function slotPurpose(ctx: Ctx, s: ItemState, asVideo: boolean): string {
  const slot = ctx.slots.get(s.item.slotId)!.slot
  if (asVideo) return slot.priority === "hero" ? "hero_video" : "section_video"
  return slot.purpose
}

// One batched call writes a prompt for every pending image item.
async function ensureImagePrompts(ctx: Ctx): Promise<void> {
  const pending = Object.values(ctx.state.items).filter((s) => s.item.kind === "image" && s.item.decision === "GENERATE" && !TERMINAL.has(s.status) && !s.imagePrompt && !s.image)
  for (let i = 0; i < pending.length; i += 10) {
    const chunk = pending.slice(i, i + 10)
    ctx.stage("media.images")
    const batch = await ask(
      ctx,
      "images",
      "FRAMES",
      "media.image_prompts",
      "media-creative",
      imagePromptsPrompt({
        items: chunk.map((s) => ({
          itemId: s.item.itemId,
          role: s.item.role,
          intent: s.item.intent,
          subjectDirection: s.item.subjectDirection,
          mood: s.item.mood,
          aspect: s.item.aspect,
          textSafeZone: s.item.textSafeZone ?? "left",
        })),
        visualSystem: ctx.visualSystem,
        palette: ctx.palette,
        brief: ctx.brief,
      }),
      zodParse(ImagePromptBatchSchema),
    )
    for (const s of chunk) {
      const p = batch.prompts.find((x) => x.itemId === s.item.itemId)?.prompt
      if (p) s.imagePrompt = await safePrompt(ctx, s.item.itemId, p)
    }
    await ctx.save()
  }
}

async function imageItem(ctx: Ctx, s: ItemState): Promise<void> {
  let prompt = s.imagePrompt
  if (!prompt) throw new ItemFailure("No prompt was written for this image")
  if (s.note) prompt = await revise(ctx, s.item.itemId, prompt, s.note, "The user asked for a change")
  const refs = await referenceImages(ctx, s)
  if (refs.length) prompt += " Preserve the product in the reference images exactly."
  const base = (s.done.length + 1) * 10
  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
    ctx.stage("media.images")
    const { assetId, bytes } = await generatedAsset(ctx, s, "FRAMES", base + attempt, { prompt, target: stillSize(s.item.aspect), edit: refs.length ? refs : undefined }, { purpose: slotPurpose(ctx, s, false), role: s.item.role })
    ctx.stage("media.qa")
    const qa = await qaImage(ctx, s, assetId, bytes, { intent: s.item.intent })
    if (qa.pass) {
      await updateAsset(ctx.deps, assetId, { altText: qa.altText, description: s.item.intent.slice(0, 300), decorative: s.item.display === "background" })
      s.image = { prompt, assetId, attempts: attempt, altText: qa.altText }
      s.overlay = qa.overlay
      return
    }
    await discard(ctx, assetId)
    if (attempt < MAX_IMAGE_ATTEMPTS) prompt = await revise(ctx, s.item.itemId, prompt, qa.fix, qa.reasons)
  }
  throw new ItemFailure("The images did not pass quality checks")
}

// ---------------------------------------------------------------- video chain

function usedByOthers(ctx: Ctx, self: ItemState): { mechanisms: string[]; motifs: string[] } {
  const others = Object.values(ctx.state.items).filter((s) => s !== self && s.concept?.chosenId)
  const chosen = others.map((s) => s.concept!.concepts.find((c) => c.id === s.concept!.chosenId)).filter(Boolean)
  return { mechanisms: chosen.map((c) => c!.mechanism), motifs: chosen.map((c) => c!.title) }
}

async function conceptsAndSelect(ctx: Ctx, s: ItemState): Promise<"ok" | "still"> {
  const duration = s.item.video?.durationSec ?? 5
  return ctx.deps.semaphores.concepts.run(async () => {
    for (let round = 1; round <= 2; round++) {
      ctx.stage("media.concepts")
      const used = usedByOthers(ctx, s)
      let violation = s.note
      let valid: ReturnType<typeof checkConceptSet>["valid"] = []
      for (let tries = 1; tries <= 2 && valid.length < 2; tries++) {
        const set = await ask(
          ctx,
          s.item.itemId,
          "CONCEPTS",
          "media.concepts",
          "media-creative",
          conceptsPrompt({ brief: ctx.brief, item: s.item, visualSystem: ctx.visualSystem, usedMechanisms: used.mechanisms, usedMotifs: used.motifs, hasReference: !!s.item.referenceAssetIds?.length, violation }),
          zodParse(ConceptSetSchema),
        )
        const check = checkConceptSet(set.concepts, duration, ctx.palette)
        valid = check.valid.filter((c) => !used.mechanisms.includes(c.mechanism))
        violation = check.errors.join("; ") || "two or more concepts reused a mechanism already used on this site"
      }
      if (valid.length < 2) return "still"
      ctx.stage("media.select")
      const judge = await ask(ctx, s.item.itemId, "SELECT", "media.judge", "media-creative", judgePrompt({ brief: ctx.brief, item: s.item, visualSystem: ctx.visualSystem, used: [...used.mechanisms, ...used.motifs], concepts: valid }), zodParse(JudgeOutputSchema))
      const { winnerId, ranked } = selectWinner(valid, judge)
      if (!winnerId) continue
      s.concept = {
        concepts: valid,
        judge,
        ranked,
        recommendedId: winnerId,
        chosenId: winnerId,
        directorNotes: judge.directorNotes,
        regenerations: s.concept?.regenerations ?? 0,
      }
      s.note = undefined
      return "ok"
    }
    return "still"
  })
}

// Fewer than two good concepts, or every concept vetoed: a plain still image instead of a video.
async function downgradeToStill(ctx: Ctx, s: ItemState): Promise<void> {
  const slot = ctx.slots.get(s.item.slotId)!.slot
  if (!slot.kinds.includes("image")) throw new ItemFailure("No usable video idea, and this spot can't take a still image")
  const charge = ctx.state.charges[s.item.itemId] ?? 0
  await refundAmount(ctx.deps.db, ctx.job, ctx.state, `${s.item.itemId}:still`, charge - ctx.deps.config.ai.credits.image, "AI video replaced by a still image")
  s.item = { ...s.item, kind: "image", video: undefined }
  s.done = []
  await ensureImagePrompts(ctx)
}

async function videoFrames(ctx: Ctx, s: ItemState): Promise<void> {
  const concept = s.concept!.concepts.find((c) => c.id === s.concept!.chosenId)!
  ctx.stage("media.frames")
  const prompts = await ask(
    ctx,
    s.item.itemId,
    "FRAMES",
    "media.frames",
    "media-creative",
    framesPrompt({ concept, directorNotes: [...s.concept!.directorNotes, ...(s.note ? [s.note] : [])], visualSystem: ctx.visualSystem, palette: ctx.palette, textSafeZone: s.item.textSafeZone ?? "left", aspect: s.item.aspect, wantEnding: true }),
    zodParse(FramePromptsSchema),
  )
  const target = videoFrameSize(s.item.aspect)
  const refs = await referenceImages(ctx, s)
  const meta = { purpose: slotPurpose(ctx, s, true), conceptId: concept.id, mechanism: concept.mechanism, role: s.item.role }
  const base = (s.concept!.regenerations + 1) * 100 + (s.note ? 50 : 0)

  let openingPrompt = await safePrompt(ctx, s.item.itemId, prompts.openingPrompt + (refs.length ? " Preserve the product in the reference images exactly." : ""))
  let opening: { assetId: string; bytes: Buffer; altText: string; overlay: "none" | "light" | "dark" } | null = null
  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS && !opening; attempt++) {
    const out = await generatedAsset(ctx, s, "FRAMES:open", base + attempt, { prompt: openingPrompt, target, edit: refs.length ? refs : undefined }, meta)
    ctx.stage("media.qa")
    const qa = await qaImage(ctx, s, out.assetId, out.bytes, { intent: `${s.item.intent}. Opening frame: ${concept.openingFrame}` })
    if (qa.pass) opening = { ...out, altText: qa.altText, overlay: qa.overlay }
    else {
      await discard(ctx, out.assetId)
      if (attempt < MAX_IMAGE_ATTEMPTS) openingPrompt = await revise(ctx, s.item.itemId, openingPrompt, qa.fix, qa.reasons)
    }
  }
  if (!opening) throw new ItemFailure("The opening scene did not pass quality checks")
  await updateAsset(ctx.deps, opening.assetId, { altText: opening.altText, description: concept.logline.slice(0, 300) })

  let ending: { assetId: string } | null = null
  if (prompts.endingPrompt) {
    let endingPrompt = await safePrompt(ctx, s.item.itemId, prompts.endingPrompt)
    for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS && !ending; attempt++) {
      ctx.stage("media.frames")
      const out = await generatedAsset(ctx, s, "FRAMES:end", base + attempt, { prompt: endingPrompt, target, edit: [opening.bytes] }, meta)
      ctx.stage("media.qa")
      const qa = await qaImage(ctx, s, out.assetId, out.bytes, { intent: `Ending frame: ${concept.endingFrame}`, ending: opening.bytes })
      if (qa.pass) ending = { assetId: out.assetId }
      else {
        await discard(ctx, out.assetId)
        if (attempt < MAX_IMAGE_ATTEMPTS) endingPrompt = await revise(ctx, s.item.itemId, endingPrompt, qa.fix, qa.reasons)
      }
    }
  }
  s.frames = {
    openingPrompt,
    ...(prompts.endingPrompt ? { endingPrompt: prompts.endingPrompt } : {}),
    openingAssetId: opening.assetId,
    ...(ending ? { endingAssetId: ending.assetId } : {}),
    attempts: 1,
    altText: opening.altText,
  }
  s.overlay = opening.overlay
  s.note = undefined
}

async function videoPrompt(ctx: Ctx, s: ItemState): Promise<void> {
  const concept = s.concept!.concepts.find((c) => c.id === s.concept!.chosenId)!
  const planned = s.item.video?.durationSec ?? ctx.deps.config.ai.videoMinSeconds
  const opening = await originalBytes(ctx, s.frames!.openingAssetId)
  const ending = s.frames!.endingAssetId ? await originalBytes(ctx, s.frames!.endingAssetId) : null
  if (!opening) throw new ItemFailure("The opening scene is missing")
  ctx.stage("media.video")
  const out = await ask(
    ctx,
    s.item.itemId,
    "VIDEO_PROMPT",
    "media.video_prompt",
    "media-vision",
    videoPromptPrompt({ concept, directorNotes: s.concept!.directorNotes, durationSec: planned, minSeconds: ctx.deps.config.ai.videoMinSeconds, maxSeconds: ctx.deps.config.ai.videoMaxSeconds, hasEnding: !!ending, maxChars: ctx.deps.config.promptMaxChars }),
    zodParse(VideoPromptSchema),
    ending ? [png(opening), png(ending)] : [png(opening)],
  )
  const { videoMinSeconds: min, videoMaxSeconds: max } = ctx.deps.config.ai
  const durationSec = Math.round(Math.min(max, Math.max(min, planned - 2, Math.min(planned + 2, out.durationSec))))
  s.video = {
    mode: ending && out.mode === "FIRST_AND_LAST" ? "FIRST_AND_LAST" : "FIRST_ONLY",
    durationSec,
    prompt: await safePrompt(ctx, s.item.itemId, out.prompt.slice(0, ctx.deps.config.promptMaxChars)),
    loop: out.loop && !!s.item.video?.loopable,
    candidateAssetIds: [],
    attempts: 0,
  }
}

class VideoOutcome extends Error {
  constructor(public readonly kind: "REFUSED" | "FAILED" | "TIMEOUT", message: string) {
    super(message)
  }
}

async function renderVideo(ctx: Ctx, s: ItemState, prompt: string, keyAttempt: string): Promise<string[]> {
  const v = s.video!
  const key = requestKey(ctx.job.id, "VIDEO", s.item.itemId, Number.parseInt(keyAttempt.replace(/\D/g, "") || "1", 10)) + keyAttempt
  const provider = ctx.deps.video
  const results = ctx.job.mode === "MANUAL" ? Math.min(3, Math.max(1, s.candidates ?? 1)) : 1
  let row = await ctx.deps.db.mediaGeneration.findUnique({ where: { requestKey: key } })
  if (row?.status === "SUCCEEDED") return v.candidateAssetIds
  const direct = ctx.deps.config.directUpload && results === 1
  if (!row) {
    // The task id is stored before submitting, so a crash resumes polling instead of paying twice.
    row = await ctx.deps.db.mediaGeneration.create({
      data: {
        jobId: ctx.job.id,
        itemId: s.item.itemId,
        stage: "VIDEO",
        kind: "video",
        provider: provider.name,
        model: provider.model,
        requestKey: key,
        providerTaskId: provider.taskIdFor(key),
        status: "PENDING",
        promptText: prompt.slice(0, 8000),
        inputAssetIds: json([s.frames!.openingAssetId, ...(v.mode === "FIRST_AND_LAST" && s.frames!.endingAssetId ? [s.frames!.endingAssetId] : [])]),
      },
    })
  }
  const taskId = row.providerTaskId!
  const started = row.createdAt.getTime()
  return ctx.deps.semaphores.video.run(async () => {
    let reserved = row!.outputAssetId ? { assetId: row!.outputAssetId, key: "" } : null
    const submit = async () => {
      const first = await originalBytes(ctx, s.frames!.openingAssetId)
      const last = v.mode === "FIRST_AND_LAST" && s.frames!.endingAssetId ? await originalBytes(ctx, s.frames!.endingAssetId) : null
      if (!first) throw new ItemFailure("The opening scene is missing")
      let deliverTo: { presignedPutUrl: string } | undefined
      if (direct) {
        reserved ??= await ctx.deps.reserveAsset({
          projectId: ctx.job.projectId,
          userId: ctx.job.userId,
          kind: "VIDEO",
          mime: "video/mp4",
          purpose: slotPurpose(ctx, s, true),
          generation: { jobId: ctx.job.id, itemId: s.item.itemId, conceptId: s.concept!.chosenId, provider: provider.name, model: provider.model, summary: s.concept!.concepts.find((c) => c.id === s.concept!.chosenId)?.logline },
        })
        await ctx.deps.db.mediaGeneration.update({ where: { id: row!.id }, data: { outputAssetId: reserved.assetId } })
        const asset = await ctx.deps.db.mediaAsset.findUnique({ where: { id: reserved.assetId }, select: { originalKey: true } })
        deliverTo = { presignedPutUrl: await ctx.deps.store.presignPut(asset!.originalKey, "video/mp4", 3600) }
      }
      await provider.submit({
        prompt,
        firstFrame: first,
        ...(last ? { lastFrame: last } : {}),
        durationSec: v.durationSec,
        resolution: ctx.deps.config.videoResolution,
        results,
        promptExpansion: ctx.deps.config.promptExpansion,
        requestKey: key,
        taskId,
        ...(deliverTo ? { deliverTo } : {}),
      })
      await ctx.deps.db.mediaGeneration.update({ where: { id: row!.id }, data: { status: "RUNNING" } })
    }
    if (row!.status === "PENDING") await submit()
    let wait = 2000
    let beat = Date.now()
    for (;;) {
      if (Date.now() - started > ctx.deps.config.videoTimeoutS * 1000) {
        await ctx.deps.db.mediaGeneration.update({ where: { id: row!.id }, data: { status: "FAILED", error: "timed out", latencyMs: Date.now() - started } })
        throw new VideoOutcome("TIMEOUT", "The video took too long")
      }
      const poll = await provider.poll(taskId)
      if (poll.status === "FAILED" && poll.error === "TASK_NOT_FOUND") {
        await submit()
      } else if (poll.status === "SUCCEEDED") {
        const assets: string[] = []
        for (const output of poll.outputs ?? []) {
          if (output.delivered && reserved && (await ctx.deps.finishReserved(reserved))) assets.push(reserved.assetId)
          else if (output.url) {
            const bytes = await ctx.deps.download(output.url)
            const { assetId } = await ctx.deps.createAsset({
              projectId: ctx.job.projectId,
              userId: ctx.job.userId,
              kind: "VIDEO",
              origin: "GENERATED",
              mime: "video/mp4",
              purpose: slotPurpose(ctx, s, true),
              title: `${s.item.role} video`.slice(0, 120),
              generation: json({ jobId: ctx.job.id, itemId: s.item.itemId, conceptId: s.concept!.chosenId, mechanism: s.concept!.concepts.find((c) => c.id === s.concept!.chosenId)?.mechanism, provider: provider.name, model: provider.model, summary: s.concept!.concepts.find((c) => c.id === s.concept!.chosenId)?.logline, researchFindingIds: ctx.brief.researchFindingIds }),
              options: { stripAudio: true, skipDescribe: true },
              bytes,
            })
            assets.push(assetId)
          }
        }
        const ready: string[] = []
        for (const id of assets) if ((await waitForAsset(ctx.deps, id)) === "READY") ready.push(id)
        const cost = poll.costUsd ?? v.durationSec * results * ctx.deps.config.ai.providerCostUsd.videoPerSecond
        await ctx.deps.db.mediaGeneration.update({ where: { id: row!.id }, data: { status: "SUCCEEDED", costUsd: cost, latencyMs: Date.now() - started, outputAssetId: ready[0] ?? null } })
        await ctx.deps.db.mediaJob.update({ where: { id: ctx.job.id }, data: { costUsd: { increment: cost } } })
        if (ready.length === 0) throw new VideoOutcome("FAILED", "The video could not be processed")
        return ready
      } else if (poll.status === "REFUSED" || poll.status === "FAILED") {
        await ctx.deps.db.mediaGeneration.update({ where: { id: row!.id }, data: { status: poll.status, error: (poll.error ?? "").slice(0, 1000), latencyMs: Date.now() - started } })
        throw new VideoOutcome(poll.status, poll.error ?? "The video provider failed")
      }
      if (Date.now() - beat > 60_000) {
        beat = Date.now()
        await ctx.deps.db.mediaJob.update({ where: { id: ctx.job.id }, data: { stage: "media.video" } })
      }
      await ctx.deps.sleep(wait)
      wait = Math.min(wait * 1.5, 15_000)
    }
  })
}

async function qaVideo(ctx: Ctx, s: ItemState, assetId: string): Promise<{ pass: boolean; notes: string; fix?: string }> {
  const concept = s.concept!.concepts.find((c) => c.id === s.concept!.chosenId)!
  const [poster, last, mp4, opening, ending] = await Promise.all([
    variantBytes(ctx.deps, assetId, "poster"),
    variantBytes(ctx.deps, assetId, "poster_last"),
    variantBytes(ctx.deps, assetId, "mp4_720"),
    variantBytes(ctx.deps, s.frames!.openingAssetId, "w960"),
    s.frames!.endingAssetId ? variantBytes(ctx.deps, s.frames!.endingAssetId, "w960") : Promise.resolve(null),
  ])
  if (!poster || !last || !mp4 || !opening) return { pass: false, notes: "frames could not be read" }
  const middle = await ctx.deps.extractFrame(mp4, s.video!.durationSec / 2)
  const qa = await ask(
    ctx,
    s.item.itemId,
    "VID_QA",
    "media.video_qa",
    "media-vision",
    videoQaPrompt({ concept, loopable: !!s.item.video?.loopable }),
    zodParse(VideoQaSchema),
    [webp(poster), png(middle), webp(last), webp(opening), ...(ending ? [webp(ending)] : [])],
  )
  const pass =
    qa.startMatchesOpening &&
    qa.consistentSubject &&
    qa.motionPlausible &&
    !qa.hasText &&
    !qa.hasLogo &&
    (s.video!.mode !== "FIRST_AND_LAST" || qa.endMatchesEnding) &&
    (!s.item.video?.loopable || qa.loopSeamOk !== false)
  return { pass, notes: qa.notes, fix: qa.promptFix }
}

async function videoStage(ctx: Ctx, s: ItemState): Promise<void> {
  const v = s.video!
  let prompt = v.prompt
  let softened = false
  for (let attempt = 1; attempt <= 2; attempt++) {
    ctx.stage("media.video")
    let candidates: string[]
    try {
      candidates = await renderVideo(ctx, s, prompt, `${attempt}${softened ? "s" : ""}r${v.attempts}`)
    } catch (err) {
      if (err instanceof VideoOutcome && err.kind === "REFUSED" && !softened) {
        softened = true
        const { prompt: soft } = await ask(ctx, s.item.itemId, "VIDEO", "media.soften", "media-creative", softenPrompt({ prompt, reason: err.message }), zodParse(PromptRewriteSchema))
        prompt = await safePrompt(ctx, s.item.itemId, soft)
        attempt--
        continue
      }
      throw err
    }
    ctx.stage("media.qa")
    const qa: Record<string, { pass: boolean; notes: string }> = {}
    let fix: string | undefined
    for (const id of candidates) {
      const r = await qaVideo(ctx, s, id)
      qa[id] = { pass: r.pass, notes: r.notes }
      fix ??= r.fix
    }
    const passing = candidates.filter((id) => qa[id]!.pass)
    if (passing.length) {
      s.video = { ...v, prompt, candidateAssetIds: passing, chosenAssetId: passing[0], qa, attempts: attempt }
      for (const id of candidates.filter((c) => !passing.includes(c))) await discard(ctx, id)
      return
    }
    for (const id of candidates) await discard(ctx, id)
    if (attempt === 1) prompt = await revise(ctx, s.item.itemId, prompt, fix, "The video failed review")
  }
  throw new VideoOutcome("FAILED", "The video failed review twice")
}

// ---------------------------------------------------------------- item driver

async function failItem(ctx: Ctx, s: ItemState, reason: string): Promise<void> {
  const slot = ctx.slots.get(s.item.slotId)?.slot
  if (s.item.kind === "video" && s.frames?.openingAssetId && slot?.kinds.includes("image")) s.fallbackAssetId = s.frames.openingAssetId
  s.status = "FAILED"
  s.failureReason = reason
  await refundItem(ctx.deps.db, ctx.job, ctx.state, s.item.itemId, "AI media item failed")
  publish(ctx, s)
  await ctx.save()
  log.warn("media item failed", { jobId: ctx.job.id, itemId: s.item.itemId, reason })
}

function bindingFor(s: ItemState): MediaBindingOut | null {
  const overlay = s.item.display === "background" && s.overlay ? { overlay: s.overlay } : {}
  if (s.item.decision === "USE_UPLOADED" && s.item.assetId) {
    return { assetId: s.item.assetId, ...(s.item.video ? { loop: s.item.video.loopable, playWhen: s.item.video.playWhen } : {}) }
  }
  if (s.status === "DONE" && s.item.kind === "image" && s.image?.assetId) return { assetId: s.image.assetId, ...overlay }
  if (s.status === "DONE" && s.item.kind === "video" && s.video?.chosenAssetId) {
    return { assetId: s.video.chosenAssetId, loop: s.video.loop, playWhen: s.item.video?.playWhen ?? "in_view", ...overlay }
  }
  if (s.fallbackAssetId) return { assetId: s.fallbackAssetId, ...overlay }
  return null
}

function publish(ctx: Ctx, s: ItemState): void {
  const b = bindingFor(s)
  if (b) ctx.bindings[s.item.slotId] = b
  else delete ctx.bindings[s.item.slotId]
}

function stagesOf(s: ItemState): ItemStage[] {
  return s.item.kind === "video" ? ["CONCEPTS", "SELECT", "FRAMES", "IMG_QA", "VIDEO_PROMPT", "VIDEO", "VID_QA"] : ["FRAMES", "IMG_QA"]
}

async function runItem(ctx: Ctx, s: ItemState, maxPhase: number): Promise<void> {
  if (TERMINAL.has(s.status) || s.item.decision !== "GENERATE") return
  try {
    for (;;) {
      const next = stagesOf(s).find((stage) => !s.done.includes(stage))
      if (!next) break
      if (PHASE[next] > maxPhase) return
      if (await ctx.cancelled()) return
      s.status = "RUNNING"
      switch (next) {
        case "CONCEPTS":
          if ((await conceptsAndSelect(ctx, s)) === "still") {
            await downgradeToStill(ctx, s)
            continue
          }
          s.done.push("CONCEPTS", "SELECT")
          break
        case "SELECT":
          s.done.push("SELECT")
          break
        case "FRAMES":
          if (s.item.kind === "image") await imageItem(ctx, s)
          else await videoFrames(ctx, s)
          s.done.push("FRAMES", "IMG_QA")
          break
        case "IMG_QA":
          s.done.push("IMG_QA")
          break
        case "VIDEO_PROMPT":
          await videoPrompt(ctx, s)
          s.done.push("VIDEO_PROMPT")
          break
        case "VIDEO":
          await videoStage(ctx, s)
          s.done.push("VIDEO", "VID_QA")
          break
        case "VID_QA":
          s.done.push("VID_QA")
          break
      }
      await ctx.save()
    }
    s.status = "DONE"
    publish(ctx, s)
    await ctx.save()
  } catch (err) {
    if (err instanceof ItemFailure || err instanceof VideoOutcome || err instanceof ProviderError || err instanceof LlmValidationError || err instanceof LlmRefusalError) {
      await failItem(ctx, s, err.message)
      return
    }
    log.error("media item error", { jobId: ctx.job.id, itemId: s.item.itemId, error: errorMessage(err) })
    await failItem(ctx, s, "Something went wrong while creating this item")
  }
}

// ---------------------------------------------------------------- job driver

async function blueprintForRerun(deps: GenerateDeps, job: JobRow, state: JobState): Promise<JobPlan | null> {
  const scope = scopeOf(job.scope)
  const plan = job.plan as { budget: JobPlan["budget"]; budgetTier: JobPlan["budgetTier"] }
  const version = job.versionId ? await deps.db.projectVersion.findUnique({ where: { id: job.versionId }, select: { snapshot: true, blueprint: true } }) : null
  const spec = version?.snapshot as Partial<SiteSpec> | null
  if (!spec?.pages?.length) return null
  const existing = readBlueprint(version!.blueprint)
  const inScope = (slotId: string) => scope.kind === "site" || scope.slotIds.includes(slotId)
  const inputs = await loadBlueprintInputs(deps.db, job.projectId, job.userId, true)
  const brief = buildMediaBrief({
    brief: inputs.briefFacts,
    project: inputs.project,
    research: inputs.research,
    imageryFindingIds: inputs.imageryFindingIds,
    styleAvoid: inputs.styleAvoid,
    mediaNotes: inputs.media.notes,
    budget: plan.budget,
    hasProductPhotoUploads: inputs.hasProductPhotoUploads,
  })
  const keepBrief = (bp: NonNullable<typeof existing>) =>
    deps.db.mediaJob.update({ where: { id: job.id }, data: { mediaBrief: json({ ...brief, blueprint: { narrative: bp.narrative.storyArc, visualSystem: bp.visualSystem } }) } })
  if (existing && isBlueprintFresh(existing, spec.pages, spec.copyFramework ?? "AIDA") && existing.mediaScript.some((i) => inScope(i.slotId))) {
    await keepBrief(existing)
    // The blueprint did not have to run again, so its reserved credits go back.
    await refundItem(deps.db, job, state, "blueprint", "Existing site plan reused")
    return { items: existing.mediaScript.filter((i) => inScope(i.slotId)), dropped: [], budget: plan.budget, budgetTier: plan.budgetTier }
  }
  const palette = [spec.designSystem?.primaryColor, spec.designSystem?.secondaryColor, spec.designSystem?.accentColor, ...paletteOf(brief)].filter((c): c is string => !!c)
  const result = await runSiteBlueprint({
    mode: "media-only",
    llm: auditedLlm({ deps, job }, "blueprint", "BLUEPRINT"),
    site: { pages: spec.pages, copyFramework: spec.copyFramework ?? "AIDA", tokens: { colors: palette, fonts: [spec.designSystem?.fontPrimary ?? "", spec.designSystem?.fontSecondary ?? ""], styleTags: inputs.research?.styleTagKeys ?? [] } },
    palette,
    mediaBrief: brief,
    briefFacts: inputs.briefFacts,
    research: inputs.research,
    uploaded: inputs.uploaded,
    budget: plan.budget,
    config: deps.config.ai,
    mediaNotes: inputs.media.notes,
    ...(scope.kind === "slots" ? { slotIds: scope.slotIds } : {}),
  })
  if (!result.ok) return null
  await deps.db.projectVersion.update({ where: { id: job.versionId! }, data: { blueprint: json(result.blueprint) } })
  await keepBrief(result.blueprint)
  state.blueprintDone = true
  return { items: result.blueprint.mediaScript, dropped: result.blueprint.dropped, budget: plan.budget, budgetTier: plan.budgetTier }
}

async function finish(deps: GenerateDeps, job: JobRow, data: Prisma.MediaJobUpdateInput): Promise<void> {
  await deps.db.mediaJob.update({ where: { id: job.id }, data: { finishedAt: new Date(), ...data } })
}

async function forbiddenTerms(deps: GenerateDeps, job: JobRow): Promise<string[]> {
  const brief = await deps.db.projectBrief.findFirst({ where: { projectId: job.projectId, userId: job.userId } })
  if (!brief) return []
  const data = briefStateOf(brief).data
  return [
    ...(data.competitors ?? []).map((c) => c.name),
    ...(data.testimonials ?? []).map((t) => t.personName),
  ].filter((n): n is string => typeof n === "string" && n.trim().length >= 3)
}

export async function runMediaJob(baseDeps: GenerateDeps, jobId: string): Promise<void> {
  const deps: GenerateDeps = { ...baseDeps, semaphores: { ...baseDeps.semaphores, concepts: localSemaphore(1) } }
  const job = (await deps.db.mediaJob.findUnique({ where: { id: jobId } })) as JobRow | null
  if (!job || ["DONE", "FAILED", "CANCELLED", "AWAITING_USER"].includes(job.status)) return
  const state = readJobState(job.state)
  const persist = async (data: Prisma.MediaJobUpdateInput = {}) =>
    deps.db.mediaJob.update({ where: { id: job.id }, data: { state: json(state), ...data } })

  // Credits reserved at creation prove a paid account even if the balance is now 0.
  if (job.creditsReserved <= 0 && !(await isPaidUser(deps.db, job.userId))) {
    await refundUnspent(deps.db, { ...job, state }, "AI media is a paid feature")
    await finish(deps, job, { status: "FAILED", failureReason: "PAID_FEATURE" })
    return
  }
  await deps.db.mediaJob.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt: (job as { startedAt?: Date | null }).startedAt ?? new Date() } })

  let plan = job.plan as Partial<JobPlan> | null
  if (!plan?.items) {
    await deps.db.mediaJob.update({ where: { id: job.id }, data: { stage: "blueprint" } })
    const made = await blueprintForRerun(deps, job, state).catch((err: unknown) => {
      log.error("media re-run blueprint failed", { jobId, error: errorMessage(err) })
      return null
    })
    if (!made) {
      const fresh = await refundUnspent(deps.db, { ...job, state: { ...state, blueprintDone: false } }, "AI media planning failed")
      await finish(deps, job, { status: "FAILED", failureReason: "We couldn't plan AI media for this site. No credits were used.", state: json(fresh) })
      return
    }
    plan = made
    await deps.db.mediaJob.update({ where: { id: job.id }, data: { plan: json(made), state: json(state) } })
  }

  const items = (plan.items ?? []) as JobPlan["items"]
  if (!state.expanded) {
    await deps.db.mediaJob.update({ where: { id: job.id }, data: { stage: "media.expand" } })
    for (const item of items) state.items[item.itemId] ??= { item, status: item.decision === "USE_UPLOADED" ? "DONE" : "PENDING", done: [] }
    if (state.charges.unplanned !== undefined) {
      const unplanned = state.charges.unplanned
      delete state.charges.unplanned
      const estimate = estimateJobCost(costItems(items), deps.config.ai)
      Object.assign(state.charges, estimate.perItem)
      await refundAmount(deps.db, job, state, "plan-adjust", unplanned - estimate.credits, "AI media plan was smaller than reserved")
    }
    state.expanded = true
    await persist()
  }

  const version = job.versionId ? await deps.db.projectVersion.findUnique({ where: { id: job.versionId }, select: { snapshot: true } }) : null
  const pages = ((version?.snapshot as Partial<SiteSpec> | null)?.pages ?? []) as SiteSpec["pages"]
  const briefParsed = MediaBriefSchema.safeParse(job.mediaBrief)
  if (!briefParsed.success || !briefParsed.data.blueprint) {
    await refundUnspent(deps.db, { ...job, state }, "AI media context missing")
    await finish(deps, job, { status: "FAILED", failureReason: "AI media context is missing", state: json(state) })
    return
  }
  const brief = briefParsed.data
  let saving: Promise<unknown> = Promise.resolve()
  let lastStage: string | null = null
  const ctx: Ctx = {
    deps,
    job,
    state,
    brief,
    visualSystem: brief.blueprint!.visualSystem,
    palette: paletteOf(brief),
    // Item slots are planned before the copy agent writes items, so slots come from the planning view.
    slots: new Map(planningSlots(pages.length ? pages : []).map((r) => [r.slotId, r])),
    forbidden: await forbiddenTerms(deps, job),
    bindings: { ...((job.bindings as Record<string, MediaBindingOut> | null) ?? {}) },
    save: () => {
      saving = saving.then(() => deps.db.mediaJob.update({ where: { id: job.id }, data: { state: json(state), bindings: json(ctx.bindings) } }))
      return saving.then(() => undefined)
    },
    cancelled: async () => {
      const row = await deps.db.mediaJob.findUnique({ where: { id: job.id }, select: { status: true } })
      return !row || row.status === "CANCELLED" || row.status === "FAILED"
    },
    stage: (substep) => {
      if (substep === lastStage) return
      lastStage = substep
      void deps.db.mediaJob.update({ where: { id: job.id }, data: { stage: substep } }).catch(() => undefined)
    },
  }
  for (const s of Object.values(state.items)) {
    if (!ctx.slots.has(s.item.slotId)) {
      if (!TERMINAL.has(s.status)) await failItem(ctx, s, "Its spot no longer exists on the site")
      continue
    }
    publish(ctx, s)
  }
  await ctx.save()

  const openCheckpoint = async (checkpoint: Checkpoint) => {
    await saving
    const opened = await deps.db.mediaJob.updateMany({
      where: { id: job.id, status: "RUNNING" },
      data: { state: json(state), status: "AWAITING_USER", checkpoint, checkpointExpiresAt: new Date(Date.now() + CHECKPOINT_TTL_MS), stage: "media.awaiting_user", bindings: json(ctx.bindings) },
    })
    if (opened.count) log.info("media job awaiting user", { jobId, checkpoint })
  }
  const live = () => Object.values(state.items).filter((s) => s.item.decision === "GENERATE" && !["DROPPED", "SKIPPED", "FAILED"].includes(s.status))

  if (job.mode === "MANUAL") {
    if (!state.approved.includes("PLAN_APPROVE") && live().length > 0) return openCheckpoint("PLAN_APPROVE")
    for (const [phase, checkpoint] of CHECKPOINT_AFTER) {
      if (phase >= 2) await ensureImagePrompts(ctx).catch((err) => log.warn("image prompts failed", { jobId, error: errorMessage(err) }))
      await Promise.all(Object.values(state.items).map((s) => runItem(ctx, s, phase)))
      const relevant =
        checkpoint === "CONCEPT_PICK"
          ? live().filter((s) => s.item.kind === "video" && s.concept)
          : checkpoint === "IMAGES_APPROVE"
            ? live().filter((s) => s.frames || s.image)
            : live().filter((s) => (s.video?.candidateAssetIds.length ?? 0) > 0)
      if (!state.approved.includes(checkpoint) && relevant.length > 0) return openCheckpoint(checkpoint)
    }
  } else {
    await ensureImagePrompts(ctx).catch((err) => log.warn("image prompts failed", { jobId, error: errorMessage(err) }))
    await Promise.all(Object.values(state.items).map((s) => runItem(ctx, s, 3)))
  }

  // BIND
  ctx.stage("media.bind")
  for (const s of Object.values(state.items)) {
    if (s.status === "PENDING" && s.item.decision === "GENERATE") await failItem(ctx, s, "It could not be created")
    if (s.status === "DONE" && s.item.decision === "GENERATE") state.settled[s.item.itemId] ??= "kept"
    publish(ctx, s)
    for (const id of s.video?.candidateAssetIds ?? []) if (id !== s.video?.chosenAssetId) await discard(ctx, id)
  }
  state.bound = true
  await saving
  const finished = await deps.db.mediaJob.updateMany({
    where: { id: job.id, status: "RUNNING" },
    data: {
      state: json(state),
      status: "DONE",
      stage: "media.bind",
      finishedAt: new Date(),
      bindings: json(ctx.bindings),
      concepts: json(Object.fromEntries(Object.values(state.items).filter((s) => s.concept).map((s) => [s.item.itemId, s.concept]))),
    },
  })
  if (finished.count === 0) return
  metric("media.job_done", 1, { jobId, items: Object.keys(state.items).length, bound: Object.keys(ctx.bindings).length })
  await applyJobResult(deps.db, job.id, (args) => applyMediaBindings(deps.db, args)).catch((err) =>
    log.error("applying media bindings failed", { jobId, error: errorMessage(err) }),
  )
}
