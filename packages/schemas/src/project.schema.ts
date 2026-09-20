import { z } from "zod"
import { ModelIdSchema } from "./models.js"
import { SiteSpecSchema } from "./siteSpec.js"

export const NicheCategoryEnum = z.enum([
  "EDTECH",
  "HEALTH_WELLNESS",
  "FINTECH",
  "SAAS_B2B",
  "ECOMMERCE",
  "FOOD_LIFESTYLE",
  "FITNESS",
  "LUXURY",
  "MEDITATION",
  "KIDS",
  "OTHER",
])

export const ProjectInputTypeEnum = z.enum([
  "FROM_SCRATCH",
  "FROM_COMPETITOR",
  "FROM_OWN_SITE",
])

export const SiteTypeEnum = z.enum(["SINGLE_PAGE", "MULTI_PAGE"])

export const CreateProjectSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  startupIdea: z
    .string()
    .min(10, "Describe your idea in at least 10 characters")
    .max(2000),
  niche: NicheCategoryEnum,
  targetAudience: z.string().min(3).max(500),
  inputType: ProjectInputTypeEnum,
  sourceUrl: z.string().url("Must be a valid URL").optional(),
  siteType: SiteTypeEnum.optional(),
  // Populated by the new home-page extract flow (see
  // apps/orchestrator-service's /extract + /extract/answer routes) so the
  // minimal create form's project carries the full extracted context
  // forward into the /plan SSE call that follows project creation.
  ideaText: z.string().max(2000).optional(),
  extracted: z
    .object({
      niche: NicheCategoryEnum.optional(),
      targetAudience: z.string().optional(),
      name: z.string().optional(),
      brandPersonality: z.string().optional(),
      pricePositioning: z.string().optional(),
      businessModel: z.string().optional(),
      differentiator: z.string().optional(),
    })
    .optional(),
})

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pinned: z.boolean().optional(),
  status: z
    .enum(["DRAFT", "GENERATING", "READY", "DEPLOYING", "LIVE", "FAILED"])
    .optional(),
})

export const TierEnum = z.enum(["free", "paid"])

export const GenerateRequestSchema = z.object({
  projectId: z.string().cuid().optional(),
  versionId: z.string().cuid().optional(),
  name: z.string().min(1).max(100).optional(),
  startupIdea: z.string(),
  niche: z.string(),
  targetAudience: z.string(),
  inputType: ProjectInputTypeEnum,
  sourceUrl: z.string().url().optional(),
  scanResult: z.record(z.unknown()).optional(),
  modelId: ModelIdSchema.optional(),
  pipelineMode: z.enum(["AUTO", "MANUAL"]).optional(),
  brandPersonality: z.string().optional(),
  pricePositioning: z.string().optional(),
  businessModel: z.string().optional(),
  differentiator: z.string().optional(),
  tier: TierEnum.default("paid"),
})

export const ClarifyRequestSchema = z.object({
  startupIdea: z.string().min(3).max(2000),
  answers: z.record(z.string(), z.string()).optional(),
})

export const ClarifyQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()).optional(),
})

export const ClarifyResponseSchema = z.object({
  ready: z.boolean(),
  questions: z.array(ClarifyQuestionSchema).optional(),
  niche: NicheCategoryEnum.optional(),
  targetAudience: z.string().optional(),
  name: z.string().optional(),
  brandPersonality: z.string().optional(),
  pricePositioning: z.string().optional(),
  businessModel: z.string().optional(),
  differentiator: z.string().optional(),
})

export const IterateRequestSchema = z.object({
  projectId: z.string().cuid(),
  versionId: z.string().cuid(),
  instruction: z.string().min(1).max(2000),
  currentSpec: SiteSpecSchema,
  modelId: ModelIdSchema.optional(),
})

export const IterateChangeSchema = z.object({
  pageSlug: z.string(),
  sectionType: z.string(),
  sectionIndex: z.number(),
  instruction: z.string(),
})

export const IterateResponseSchema = z.object({
  updatedSpec: SiteSpecSchema,
  summary: z.string(),
  changed: z.boolean(),
  editSize: z.enum(["minor", "major"]),
})

export const SendMessageSchema = z.object({
  conversationId: z.string().cuid().optional(),
  content: z.string().min(1).max(2000),
  versionId: z.string().cuid(),
})

// Standalone extracted-fields shape used by the /extract and /extract/answer
// flow — mirrors ClarifyResponse's inferred fields minus "ready"/"questions",
// since here the extraction is driven by field-presence, not an LLM readiness flag.
export const ExtractedFieldsSchema = z.object({
  niche: NicheCategoryEnum.optional(),
  targetAudience: z.string().optional(),
  name: z.string().optional(),
  brandPersonality: z.string().optional(),
  pricePositioning: z.string().optional(),
  businessModel: z.string().optional(),
  differentiator: z.string().optional(),
})

export const ExtractRequestSchema = z.object({
  ideaText: z.string().min(3).max(2000),
  tier: TierEnum,
})

export const ExtractResponseSchema = z.object({
  extracted: ExtractedFieldsSchema,
  questions: z.array(ClarifyQuestionSchema).max(10),
})

export const ExtractAnswerRequestSchema = z.object({
  extracted: ExtractedFieldsSchema,
  answers: z.record(z.string(), z.string()),
})

export const ExtractAnswerResponseSchema = z.object({
  extracted: ExtractedFieldsSchema,
})

export const PlanSSERequestSchema = z.object({
  projectId: z.string(),
  versionId: z.string(),
  tier: TierEnum,
  ideaText: z.string().min(3).max(2000),
  niche: z.string(),
  targetAudience: z.string(),
  sourceUrl: z.string().url().optional(),
  extracted: ExtractedFieldsSchema.optional(),
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>
export type NicheCategory = z.infer<typeof NicheCategoryEnum>
export type ProjectInputType = z.infer<typeof ProjectInputTypeEnum>
export type ClarifyRequest = z.infer<typeof ClarifyRequestSchema>
export type ClarifyQuestion = z.infer<typeof ClarifyQuestionSchema>
export type ClarifyResponse = z.infer<typeof ClarifyResponseSchema>
export type IterateRequest = z.infer<typeof IterateRequestSchema>
export type IterateChange = z.infer<typeof IterateChangeSchema>
export type IterateResponse = z.infer<typeof IterateResponseSchema>
export type SendMessageInput = z.infer<typeof SendMessageSchema>
export type Tier = z.infer<typeof TierEnum>
export type ExtractedFields = z.infer<typeof ExtractedFieldsSchema>
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>
export type ExtractAnswerRequest = z.infer<typeof ExtractAnswerRequestSchema>
export type ExtractAnswerResponse = z.infer<typeof ExtractAnswerResponseSchema>
export type PlanSSERequest = z.infer<typeof PlanSSERequestSchema>
