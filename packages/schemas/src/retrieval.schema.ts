import { z } from "zod"
import { NicheCategoryEnum, type NicheCategory } from "./project.schema.js"

// Mirrors the Prisma ResearchCategory enum (schemas cannot import @useframe/db).
export const ResearchCategoryEnum = z.enum([
  "COLOR_PSYCHOLOGY",
  "TYPOGRAPHY",
  "SCREEN_TIME",
  "LAYOUT",
  "CONVERSION",
  "ACCESSIBILITY",
  "AGE_GROUP",
  "INDUSTRY",
  "OTHER",
])
export type ResearchCategory = z.infer<typeof ResearchCategoryEnum>

export const DECISION_AREAS = [
  "COLOR", "TYPOGRAPHY", "LAYOUT", "CONVERSION", "TRUST_SOCIAL_PROOF",
  "ACCESSIBILITY", "MOTION", "COPY_TONE", "IMAGERY",
] as const
export type DecisionArea = (typeof DECISION_AREAS)[number]

export interface RetrievalInput {
  projectId: string
  rawIdea: string
  niche: NicheCategory
  intakeAnswers: Record<string, string>
  competitorSummary?: string
}

export interface RetrievedFinding {
  findingId: string
  slug: string
  title: string
  statement: string
  appliesWhen: string | null
  category: ResearchCategory
  rrfScore: number
  rerankScore: number | null
  viaRelation: boolean
}

export interface RetrievalResult {
  areas: Array<{ area: DecisionArea; hydePassage: string; findings: RetrievedFinding[] }>
  tensions: Array<{ findingIdA: string; findingIdB: string; note: string | null }>
}

export interface CitationToSave {
  findingId: string
  decisionArea: DecisionArea
  rank: number
  rrfScore: number
  rerankScore: number | null
  viaRelation: boolean
  reasoning: string
}

export interface CitedFindingView {
  findingId: string
  slug: string
  title: string
  statement: string
  appliesWhen: string | null
  reasoning: string
  rank: number
  viaRelation: boolean
  retired: boolean
  source: { title: string; authors: string | null; year: number | null; venue: string | null;
            url: string | null; doi: string | null; locator: string | null } | null
}

export interface ProjectResearchView {
  researchReportId: string
  areas: Array<{ area: DecisionArea; findings: CitedFindingView[] }>
}

export const RetrievalInputSchema = z.object({
  projectId: z.string().min(1),
  rawIdea: z.string().min(1).max(4000),
  niche: NicheCategoryEnum,
  intakeAnswers: z.record(z.string(), z.string()),
  competitorSummary: z.string().max(2000).optional(),
}) satisfies z.ZodType<RetrievalInput>

export const CitationToSaveSchema = z.object({
  findingId: z.string().min(1),
  decisionArea: z.enum(DECISION_AREAS),
  rank: z.number().int().nonnegative(),
  rrfScore: z.number(),
  rerankScore: z.number().nullable(),
  viaRelation: z.boolean(),
  reasoning: z.string(),
}) satisfies z.ZodType<CitationToSave>

export const SaveCitationsRequestSchema = z.object({
  researchReportId: z.string().min(1),
  citations: z.array(CitationToSaveSchema),
})

// NicheCategory -> DomainPattern / ResearchFinding.appliesTo keys.
export const NICHE_TO_DOMAIN: Record<NicheCategory, string> = {
  EDTECH: "education",
  HEALTH_WELLNESS: "health_wellness",
  FINTECH: "fintech",
  SAAS_B2B: "saas_b2b",
  ECOMMERCE: "ecommerce",
  FOOD_LIFESTYLE: "food_lifestyle",
  FITNESS: "fitness",
  LUXURY: "luxury",
  MEDITATION: "health_wellness",
  KIDS: "education",
  OTHER: "other",
}

export function nicheToDomain(niche: string): string {
  return (NICHE_TO_DOMAIN as Record<string, string>)[niche] ?? "other"
}

// Plain-language audience text -> closest AudienceModifier bucket.
export function inferAudienceKey(targetAudience: string): string {
  const t = targetAudience.toLowerCase()
  if (t.includes("child") || t.includes("kid")) return "children_under_10"
  if (t.includes("teen")) return "teens"
  if (t.includes("senior") || t.includes("elder")) return "seniors"
  if (t.includes("parent")) return "parents"
  if (t.includes("b2b") || t.includes("business") || t.includes("enterprise")) return "b2b_buyers"
  if (t.includes("developer") || t.includes("engineer")) return "developers"
  if (t.includes("adult")) return "adults"
  return "general"
}
