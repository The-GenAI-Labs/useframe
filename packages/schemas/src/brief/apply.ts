import { FIELD_DEFS, REQUIRED_FIELD_IDS, isFieldId, type FieldId } from "./catalog.js"
import { PROOF_SOURCES, type BriefMeta, type FieldMeta, type Source } from "./provenance.js"
import { CLAIM_PATHS, checkClaim, isBlankValue, proofPathsForField, valueAtPath } from "./rules.js"
import { proofErrors, validateFieldValue, type BriefData, type BriefFieldErrors, type SchemaMode } from "./schema.js"

export const BRIEF_JSON_MAX_BYTES = 64 * 1024

export class BriefWriteError extends Error {
  constructor(
    readonly errors: BriefFieldErrors,
    readonly status: 413 | 422 = 422,
  ) {
    super(status === 413 ? "Brief is too large" : "Some answers need attention")
    this.name = "BriefWriteError"
  }
}

export type BriefChanges = {
  set?: Partial<Record<string, unknown>>
  unset?: string[]
  aiDecide?: Partial<Record<string, boolean>>
  confirm?: string[]
}

export type ApplyOptions = {
  source: Source
  // Attached (submitted) briefs are validated in submit mode and must keep
  // proof permission/attestation intact on every write.
  mode?: SchemaMode
  strictProof?: boolean
  confidence?: Partial<Record<FieldId, number>>
  citations?: Partial<Record<FieldId, { url: string; title?: string }[]>>
  excerpts?: Partial<Record<FieldId, string>>
  now?: Date
}

export type BriefState = { data: BriefData; meta: BriefMeta }
export type ApplyResult = BriefState & { changed: FieldId[]; skipped: FieldId[] }

function addError(errors: BriefFieldErrors, key: string, message: string): void {
  ;(errors[key] ??= []).push(message)
}

function competitorNames(data: BriefData): string[] {
  return (data.competitors ?? []).map((c) => c.name)
}

function claimStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string")
  return []
}

// Decides whether a write from `source` may replace what is stored now.
// User edits always win; everything else only fills blanks, except a
// pre-fill may replace an earlier, less confident pre-fill.
function mayWrite(source: Source, existing: unknown, meta: FieldMeta | undefined, confidence: number | undefined): boolean {
  if (source === "user") return true
  if (meta?.source === "user" && !isBlankValue(existing)) return false
  if (source === "imported") {
    if (isBlankValue(existing)) return true
    if (meta?.source !== "imported") return false
    return (confidence ?? 0) > (meta.confidence ?? 0)
  }
  return isBlankValue(existing)
}

export function applyBriefChanges(state: BriefState, changes: BriefChanges, opts: ApplyOptions): ApplyResult {
  const now = (opts.now ?? new Date()).toISOString()
  const mode = opts.mode ?? "draft"
  const data: Record<string, unknown> = structuredClone(state.data)
  const meta: BriefMeta = structuredClone(state.meta)
  const errors: BriefFieldErrors = {}
  const changed: FieldId[] = []
  const skipped: FieldId[] = []

  for (const [key, raw] of Object.entries(changes.set ?? {})) {
    if (!isFieldId(key)) {
      addError(errors, key, "Unknown field")
      continue
    }
    if (raw === undefined) continue

    const parsed = validateFieldValue(key, raw, mode)
    if (!parsed.ok) {
      Object.assign(errors, parsed.errors)
      continue
    }

    for (const path of proofPathsForField(key)) {
      const sub = valueAtPath({ [key]: parsed.value }, path)
      if (!isBlankValue(sub) && !PROOF_SOURCES.includes(opts.source)) {
        addError(errors, path, "Proof can only come from you")
      }
    }

    if (opts.source === "assumed" && (CLAIM_PATHS as readonly string[]).includes(key)) {
      for (const s of claimStrings(parsed.value)) {
        const check = checkClaim(s, competitorNames(data as BriefData))
        if (!check.ok) addError(errors, key, `Assumed claim rejected: ${check.violations.join(", ")}`)
      }
    }
    if (errors[key] || Object.keys(errors).some((k) => k.startsWith(`${key}.`))) continue

    const existing = data[key]
    const prior = meta[key]
    const confidence = opts.confidence?.[key]
    if (!mayWrite(opts.source, existing, prior, confidence)) {
      skipped.push(key)
      continue
    }

    data[key] = parsed.value
    const next: FieldMeta = {
      source: opts.source,
      confirmed: opts.source === "user",
      updatedAt: now,
    }
    if (confidence !== undefined && opts.source !== "user") next.confidence = Math.max(0, Math.min(1, confidence))
    const citations = opts.citations?.[key]
    if (citations?.length) next.citations = citations.slice(0, 10)
    const excerpt = opts.excerpts?.[key]
    if (excerpt) next.excerpt = excerpt.slice(0, 200)
    if (opts.source !== "user" && prior?.aiDecide) next.aiDecide = true
    meta[key] = next
    changed.push(key)
  }

  for (const key of changes.unset ?? []) {
    if (!isFieldId(key)) {
      addError(errors, key, "Unknown field")
      continue
    }
    if (opts.source !== "user") {
      addError(errors, key, "Only you can clear an answer")
      continue
    }
    if (mode === "submit" && REQUIRED_FIELD_IDS.includes(key)) {
      addError(errors, key, "Required")
      continue
    }
    if (key in data || key in meta) {
      delete data[key]
      delete meta[key]
      changed.push(key)
    }
  }

  for (const [key, on] of Object.entries(changes.aiDecide ?? {})) {
    if (!isFieldId(key) || !("aiDecideAllowed" in FIELD_DEFS[key] && FIELD_DEFS[key].aiDecideAllowed)) {
      addError(errors, key, "AI can't decide this one")
      continue
    }
    if (opts.source !== "user") continue
    if (on) {
      delete data[key]
      meta[key] = { source: "user", confirmed: true, aiDecide: true, updatedAt: now }
    } else if (meta[key]?.aiDecide) {
      if (key in data) {
        const { aiDecide: _drop, ...rest } = meta[key]!
        meta[key] = rest
      } else {
        delete meta[key]
      }
    }
    changed.push(key)
  }

  for (const key of changes.confirm ?? []) {
    if (!isFieldId(key) || !(key in data) || !meta[key]) {
      addError(errors, key, "Nothing to confirm")
      continue
    }
    if (opts.source !== "user") continue
    meta[key] = { ...meta[key]!, confirmed: true, updatedAt: now }
    changed.push(key)
  }

  if (Object.keys(errors).length > 0) throw new BriefWriteError(errors)

  const result = data as BriefData
  if (opts.strictProof) {
    const proof = proofErrors(result)
    if (Object.keys(proof).length > 0) throw new BriefWriteError(proof)
  }

  if (
    JSON.stringify(result).length > BRIEF_JSON_MAX_BYTES ||
    JSON.stringify(meta).length > BRIEF_JSON_MAX_BYTES
  ) {
    throw new BriefWriteError({ brief: ["This brief is too large to save"] }, 413)
  }

  return { data: result, meta, changed: [...new Set(changed)], skipped }
}

// Imported proof the user never ticked as accurate does not count.
export function dropUnconfirmedImportedProof(state: BriefState): BriefState & { dropped: FieldId[] } {
  const data: Record<string, unknown> = structuredClone(state.data)
  const meta: BriefMeta = structuredClone(state.meta)
  const dropped: FieldId[] = []
  for (const field of ["testimonials", "trustedBy", "metrics", "certifications"] as const) {
    if (meta[field]?.source === "imported" && !meta[field]?.confirmed && field in data) {
      delete data[field]
      delete meta[field]
      dropped.push(field)
    }
  }
  if (meta.pricing?.source === "imported" && !meta.pricing.confirmed) {
    const pricing = data.pricing as { plans?: unknown } | undefined
    if (pricing?.plans) {
      delete pricing.plans
      dropped.push("pricing")
    }
  }
  return { data: data as BriefData, meta, dropped }
}

export function unconfirmedClaims(state: BriefState): FieldId[] {
  return CLAIM_PATHS.filter((f) => {
    const m = state.meta[f]
    return m?.source === "assumed" && !m.confirmed && !isBlankValue(state.data[f])
  })
}
