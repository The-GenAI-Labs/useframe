import { generateText, type LanguageModelV1 } from "ai"
import { prisma, writeBriefFields, briefStateOf, type Prisma } from "@useframe/db"
import {
  CLAIM_PATHS,
  FIELD_IDS,
  blankRule,
  checkClaim,
  defaultValueFor,
  isBlankValue,
  toLlmSafeView,
  validateFieldValue,
  type BriefData,
  type BriefMeta,
  type BriefResolution,
  type FieldId,
} from "@repo/schemas"
import { RESOLVE_SYSTEM_PROMPT, resolvePrompt } from "@/prompts/brief.prompt.js"
import { parseJsonObject, readEntry } from "./briefPrefill.agent.js"

const RESOLVE_TIME_LIMIT_MS = 30_000

type Drafted = { values: Partial<Record<FieldId, unknown>>; confidence: Partial<Record<FieldId, number>> }

function normalizeString(value: string, multiline: boolean): string {
  const t = value.trim()
  return multiline ? t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n") : t.replace(/\s+/g, " ")
}

// Trim, collapse whitespace, drop empty and duplicate list items. Only the
// user's own answers are rewritten, so other provenance stays intact.
export function normalizeBrief(data: BriefData, meta: BriefMeta = {}): Partial<Record<FieldId, unknown>> {
  const changes: Partial<Record<FieldId, unknown>> = {}
  const walk = (v: unknown, multiline: boolean): unknown => {
    if (typeof v === "string") return normalizeString(v, multiline)
    if (Array.isArray(v)) {
      const seen = new Set<string>()
      return v
        .map((x) => walk(x, multiline))
        .filter((x) => !isBlankValue(x))
        .filter((x) => {
          const key = JSON.stringify(x).toLowerCase()
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
    }
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, multiline)]))
    }
    return v
  }
  for (const id of FIELD_IDS) {
    const value = data[id]
    if (value === undefined || (meta[id] && meta[id]!.source !== "user")) continue
    const next = walk(value, ["oneLiner", "problem", "audienceDescription", "objections", "visualNotes"].includes(id))
    if (JSON.stringify(next) !== JSON.stringify(value) && validateFieldValue(id, next, "draft").ok) changes[id] = next
  }
  return changes
}

export function fieldsToAssume(data: BriefData, meta: BriefMeta): FieldId[] {
  return FIELD_IDS.filter((id) => {
    if (!isBlankValue(data[id])) return false
    return blankRule(id).kind === "assume" || meta[id]?.aiDecide === true
  })
}

function parseDrafted(raw: unknown, wanted: FieldId[]): Drafted {
  const out: Drafted = { values: {}, confidence: {} }
  const fields = (raw as { fields?: unknown } | null)?.fields
  if (!fields || typeof fields !== "object") return out
  for (const id of wanted) {
    const entry = readEntry((fields as Record<string, unknown>)[id])
    if (!entry || entry.value === undefined || entry.value === null) continue
    if (!validateFieldValue(id, entry.value, "draft").ok) continue
    out.values[id] = entry.value
    const c = Number(entry.confidence)
    out.confidence[id] = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.5
  }
  return out
}

function claimViolations(values: Drafted["values"], competitors: string[]): Partial<Record<FieldId, string[]>> {
  const out: Partial<Record<FieldId, string[]>> = {}
  for (const id of CLAIM_PATHS) {
    const v = values[id]
    const strings = typeof v === "string" ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
    const problems = strings.flatMap((s) => checkClaim(s, competitors).violations)
    if (problems.length > 0) out[id] = [...new Set(problems)]
  }
  return out
}

// FAQ answers aren't claim fields, but an invented "we're SOC 2 compliant"
// in one would be; drop any drafted item that trips the filter.
function filterFaq(values: Drafted["values"], competitors: string[]): void {
  const faq = values.faq as { q: string; a: string }[] | undefined
  if (!faq) return
  const kept = faq.filter((item) => checkClaim(`${item.q} ${item.a}`, competitors).ok)
  if (kept.length > 0) values.faq = kept
  else delete values.faq
}

async function draft(
  model: LanguageModelV1,
  briefJson: string,
  fields: FieldId[],
  signal: AbortSignal,
  violations?: Partial<Record<FieldId, string[]>>,
): Promise<Drafted> {
  const { text } = await generateText({
    model,
    system: RESOLVE_SYSTEM_PROMPT,
    prompt: resolvePrompt(briefJson, fields, violations),
    maxTokens: 6000,
    abortSignal: signal,
    experimental_telemetry: { isEnabled: true, functionId: "brief.resolve" },
  })
  const parsed = parseJsonObject(text)
  if (!parsed) throw new Error("unparseable draft")
  return parseDrafted(parsed, fields)
}

export type ResolveOutcome = {
  status: "AWAITING_REVIEW" | "APPROVED" | "SKIPPED"
  assumed: FieldId[]
  dropped: FieldId[]
  failed: boolean
}

export async function resolveBrief(briefId: string, userId: string, model: LanguageModelV1): Promise<ResolveOutcome> {
  const started = Date.now()
  const brief = await prisma.projectBrief.findFirst({ where: { id: briefId, userId } })
  if (!brief) throw new Error("Brief not found")
  if (brief.status !== "RESOLVING") return { status: "SKIPPED", assumed: [], dropped: [], failed: false }

  const initial = briefStateOf(brief)
  const normalized = normalizeBrief(initial.data, initial.meta)
  if (Object.keys(normalized).length > 0) {
    await writeBriefFields({ briefId, changes: { set: normalized }, source: "user" })
  }

  let current = await prisma.projectBrief.findUniqueOrThrow({ where: { id: briefId } })
  const defaults: Partial<Record<FieldId, unknown>> = {}
  for (const id of FIELD_IDS) {
    const state = briefStateOf(current)
    if (blankRule(id).kind !== "default" || !isBlankValue(state.data[id])) continue
    const value = defaultValueFor(id, state.data as Record<string, unknown>)
    if (!isBlankValue(value)) defaults[id] = value
  }
  if (Object.keys(defaults).length > 0) {
    current = (await writeBriefFields({ briefId, changes: { set: defaults }, source: "default" })).brief
  }

  const state = briefStateOf(current)
  const wanted = fieldsToAssume(state.data, state.meta)
  const competitors = (state.data.competitors ?? []).map((c) => c.name)
  let drafted: Drafted = { values: {}, confidence: {} }
  let failed = false
  const dropped: FieldId[] = []

  if (wanted.length > 0) {
    const signal = AbortSignal.timeout(RESOLVE_TIME_LIMIT_MS)
    const briefJson = JSON.stringify(toLlmSafeView(state.data))
    try {
      drafted = await draft(model, briefJson, wanted, signal)
      const violations = claimViolations(drafted.values, competitors)
      if (Object.keys(violations).length > 0) {
        const retryFields = Object.keys(violations) as FieldId[]
        const retried = await draft(model, briefJson, retryFields, signal, violations).catch(() => ({ values: {}, confidence: {} }) as Drafted)
        for (const id of retryFields) {
          delete drafted.values[id]
          if (retried.values[id] !== undefined) {
            drafted.values[id] = retried.values[id]
            drafted.confidence[id] = retried.confidence[id]
          }
        }
        const still = claimViolations(drafted.values, competitors)
        for (const id of Object.keys(still) as FieldId[]) {
          delete drafted.values[id]
          dropped.push(id)
        }
      }
      filterFaq(drafted.values, competitors)
    } catch (err) {
      failed = true
      drafted = { values: {}, confidence: {} }
      console.error(`[brief.resolve] draft failed brief=${briefId} fields=${wanted.length}:`, err instanceof Error ? err.name : "unknown")
    }
    if (failed) dropped.push(...wanted.filter((id) => !dropped.includes(id)))
  }

  const assumed = Object.keys(drafted.values) as FieldId[]
  const resolution: BriefResolution = {
    ...(failed ? { notice: "resolve_failed" } : {}),
    ...(dropped.length > 0 ? { dropped } : {}),
  }
  const needsReview = assumed.length > 0 || failed

  const result = await writeBriefFields({
    briefId,
    changes: { set: drafted.values },
    source: "assumed",
    confidence: drafted.confidence,
    columns: needsReview
      ? { status: "AWAITING_REVIEW", resolution: resolution as Prisma.InputJsonValue }
      : { status: "APPROVED", approvedAt: new Date(), resolution: resolution as Prisma.InputJsonValue },
    ...(needsReview ? {} : { revisionReason: "APPROVED" as const }),
  })

  if (current.projectId) {
    await prisma.pipelineLog
      .create({
        data: {
          projectId: current.projectId,
          jobId: `brief:${briefId}:resolve:${result.brief.version}`,
          stage: "RESEARCH",
          status: needsReview ? "brief:AWAITING_REVIEW" : "brief:APPROVED",
          totalMs: Date.now() - started,
          ...(failed ? { errorStage: "brief", errorMessage: "draft failed" } : {}),
        },
      })
      .catch(() => {})
  }

  console.log(
    `[brief.resolve] brief=${briefId} assumed=${assumed.length} dropped=${dropped.length} failed=${failed} ms=${Date.now() - started}`,
  )
  return { status: needsReview ? "AWAITING_REVIEW" : "APPROVED", assumed, dropped, failed }
}
