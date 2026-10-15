import type { LlmSafeBrief } from "@repo/schemas"
import type { Budget } from "./config.js"
import { MediaBriefSchema, type MediaBrief, type Narrative, type VisualSystem } from "./schemas.js"

export class MediaBriefError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MediaBriefError"
  }
}

export type ResearchForMedia = {
  primaryColor: string
  secondaryColor: string
  accentColor: string
  colorPalette: unknown
  imageStyle: string
  imageDirection: unknown
  animationStyle?: string | null
  targetAgeGroup?: string | null
  toneOfVoice?: string | null
  competitorInsights?: unknown
}

export type MediaBriefInput = {
  // Always the LLM-safe view of the Project Brief (toLlmSafeView), or null for legacy projects.
  brief: LlmSafeBrief | null
  project: { startupIdea: string; targetAudience: string; niche?: string | null }
  research: ResearchForMedia | null
  imageryFindingIds: string[]
  styleAvoid: string[]
  mediaNotes?: string
  budget: Budget
  hasProductPhotoUploads: boolean
  blueprint?: { narrative: Narrative; visualSystem: VisualSystem }
}

export const GLOBAL_AVOID = [
  "readable text, letters or numbers",
  "logos or watermarks",
  "real people's likeness",
  "existing brands or characters",
  "fake product interfaces or screens",
  "extra fingers or distorted limbs",
]

const HEX = /^#[0-9a-f]{6}$/i

function hexes(value: unknown): string[] {
  const found = new Set<string>()
  const visit = (v: unknown) => {
    if (typeof v === "string" && HEX.test(v.trim())) found.add(v.trim().toLowerCase())
    else if (Array.isArray(v)) v.forEach(visit)
    else if (v && typeof v === "object") Object.values(v).forEach(visit)
  }
  visit(value)
  return [...found]
}

function summarize(value: unknown, max: number): string {
  if (!value || typeof value !== "object") return ""
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("; ")
    .slice(0, max)
}

function stringsAt(value: unknown, key: string): string[] {
  const v = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []
}

// Sentences from the user's notes that ask for something to be left out.
function avoidPhrases(notes: string | undefined): string[] {
  if (!notes) return []
  return (notes.match(/[^.!?\n]+/g) ?? [])
    .map((s) => s.trim())
    .filter((s) => /\b(avoid|don'?t|do not|no|never|without)\b/i.test(s))
    .map((s) => s.slice(0, 160))
}

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export function buildMediaBrief(input: MediaBriefInput): MediaBrief {
  const r = input.research
  if (!r || !HEX.test(r.primaryColor ?? "") || !HEX.test(r.secondaryColor ?? "") || !HEX.test(r.accentColor ?? "")) {
    throw new MediaBriefError("Research has no palette yet, so media cannot be planned")
  }
  if (!r.imageStyle?.trim()) throw new MediaBriefError("Research has no image style yet, so media cannot be planned")

  const b = input.brief
  const primary = r.primaryColor.toLowerCase()
  const secondary = r.secondaryColor.toLowerCase()
  const accent = r.accentColor.toLowerCase()
  const neutrals = hexes(r.colorPalette).filter((h) => h !== primary && h !== secondary && h !== accent).slice(0, 6)
  const subject = b?.oneLiner ?? (b?.productType ? `${b.productType.toLowerCase().replace(/_/g, " ")}: ${input.project.startupIdea}` : input.project.startupIdea)
  const mood = [...(b?.tone ?? []).map((t) => t.toLowerCase()), ...(r.toneOfVoice ? [r.toneOfVoice] : [])]

  return MediaBriefSchema.parse({
    subject: clip(subject, 400),
    audience: {
      ...(r.targetAgeGroup ? { ageGroup: clip(r.targetAgeGroup, 60) } : {}),
      ...(b?.audienceSegment ? { segment: b.audienceSegment } : {}),
      ...(input.project.niche ? { industry: clip(input.project.niche, 80) } : {}),
      ...(b?.audienceDetails?.techLevel ? { techLevel: b.audienceDetails.techLevel } : {}),
    },
    message: clip(b?.valueProp ?? b?.oneLiner ?? input.project.startupIdea, 400),
    mood: mood.slice(0, 8).map((m) => clip(m, 60)),
    palette: { primary, secondary, accent, neutrals },
    styleDirection: clip([r.imageStyle, summarize(r.imageDirection, 600)].filter(Boolean).join(". "), 800),
    ...(r.animationStyle ? { motionStyle: clip(r.animationStyle, 200) } : {}),
    researchFindingIds: input.imageryFindingIds.slice(0, 20),
    avoid: [
      ...GLOBAL_AVOID,
      ...input.styleAvoid,
      ...stringsAt(r.competitorInsights, "conventionsToAvoidCopying"),
      ...avoidPhrases(input.mediaNotes),
    ]
      .map((s) => clip(s.trim(), 160))
      .filter(Boolean)
      .slice(0, 40),
    ...(input.mediaNotes?.trim() ? { userNotes: input.mediaNotes.trim().slice(0, 300) } : {}),
    budget: input.budget,
    hasProductPhotoUploads: input.hasProductPhotoUploads,
    ...(input.blueprint
      ? {
          blueprint: {
            narrative: clip(
              [input.blueprint.narrative.storyArc, input.blueprint.narrative.emotionalTone].join(" "),
              1500,
            ),
            visualSystem: input.blueprint.visualSystem,
          },
        }
      : {}),
  })
}

export function paletteOf(brief: MediaBrief): string[] {
  return [brief.palette.primary, brief.palette.secondary, brief.palette.accent, ...brief.palette.neutrals]
}
