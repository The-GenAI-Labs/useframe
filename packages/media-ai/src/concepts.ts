import { CLICHES, type Mechanism } from "./constants.js"
import { colorsIn, hexToRgb, minDeltaE, PALETTE_TOLERANCE, type Rgb } from "./palette.js"
import { ConceptSchema, type Concept, type JudgeOutput, type JudgeScore } from "./schemas.js"

export function findCliche(text: string, extra: readonly string[] = []): string | null {
  const lower = text.toLowerCase()
  return [...CLICHES, ...extra].find((c) => lower.includes(c.toLowerCase())) ?? null
}

export type ConceptCheck = { concept: Concept | null; errors: string[] }

const CUT_WORDS = /\b(cut to|hard cut|jump cut|smash cut|montage|scene change|transition to a new scene)\b/i

export function checkConcept(raw: unknown, durationSec: number, paletteHex: readonly string[]): ConceptCheck {
  const parsed = ConceptSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { concept: null, errors: [`${issue?.path.join(".") || "concept"} ${issue?.message ?? "is invalid"}`] }
  }
  const c = parsed.data
  const errors: string[] = []
  const searchable = [c.title, c.logline, c.openingFrame, c.endingFrame, ...c.beats.map((b) => b.change)].join(" ")
  const cliche = findCliche(searchable)
  if (cliche) errors.push(`uses the cliché "${cliche}"`)
  if (c.beats.some((b) => b.atSec > durationSec)) errors.push(`beats go beyond ${durationSec}s`)
  if (c.beats.some((b, i) => i > 0 && b.atSec < c.beats[i - 1]!.atSec)) errors.push("beats are not in playback order")
  if (CUT_WORDS.test(`${c.camera} ${searchable}`)) errors.push("must be one continuous shot without cuts")
  const flagged = Object.entries(c.flags).filter(([, v]) => v).map(([k]) => k)
  if (flagged.length) errors.push(`flags set: ${flagged.join(", ")}`)
  const palette = paletteHex.flatMap((h) => (hexToRgb(h) ? [hexToRgb(h)!] : [])) as Rgb[]
  const offPalette = colorsIn(c.paletteUse).filter((rgb) => minDeltaE(rgb, palette) > PALETTE_TOLERANCE)
  if (offPalette.length) errors.push("paletteUse names colours outside the palette")
  return { concept: errors.length ? null : c, errors }
}

export type ConceptSetCheck = { valid: Concept[]; errors: string[] }

// Keeps at most three valid concepts with distinct mechanisms, ids A/B/C in order.
export function checkConceptSet(raw: readonly unknown[], durationSec: number, paletteHex: readonly string[]): ConceptSetCheck {
  const valid: Concept[] = []
  const errors: string[] = []
  const mechanisms = new Set<Mechanism>()
  raw.slice(0, 3).forEach((entry, i) => {
    const { concept, errors: e } = checkConcept(entry, durationSec, paletteHex)
    if (!concept) return void errors.push(...e.map((msg) => `concept ${i + 1}: ${msg}`))
    if (mechanisms.has(concept.mechanism)) {
      return void errors.push(`concept ${concept.id}: mechanism ${concept.mechanism} is already used by another concept`)
    }
    mechanisms.add(concept.mechanism)
    valid.push(concept)
  })
  if (raw.length < 3) errors.push(`expected 3 concepts, got ${raw.length}`)
  return { valid, errors }
}

export const JUDGE_WEIGHTS = { messageFit: 0.25, audienceFit: 0.2, memorability: 0.2, feasibility: 0.25, brandFit: 0.1 }

export function weightedScore(s: JudgeScore): number {
  return (
    s.messageFit * JUDGE_WEIGHTS.messageFit +
    s.audienceFit * JUDGE_WEIGHTS.audienceFit +
    s.memorability * JUDGE_WEIGHTS.memorability +
    s.feasibility * JUDGE_WEIGHTS.feasibility +
    s.brandFit * JUDGE_WEIGHTS.brandFit
  )
}

// The winner comes from the scores, never from the judge's own winnerId.
export function selectWinner(concepts: readonly Concept[], judge: JudgeOutput): { winnerId: Concept["id"] | null; ranked: { id: Concept["id"]; score: number }[] } {
  const ids = new Set(concepts.map((c) => c.id))
  const ranked = judge.scores
    .filter((s) => ids.has(s.id) && !s.veto)
    .map((s) => ({ id: s.id, score: Math.round(weightedScore(s) * 100) / 100, feasibility: s.feasibility }))
    .sort((a, b) => b.score - a.score || b.feasibility - a.feasibility)
  return { winnerId: ranked[0]?.id ?? null, ranked: ranked.map(({ id, score }) => ({ id, score })) }
}
