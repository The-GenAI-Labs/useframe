import { z } from "zod"
import { ModelIdSchema } from "./models.js"

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
})
  .refine(
    (data) =>
      data.inputType === "FROM_SCRATCH" ||
      (data.sourceUrl !== undefined && data.sourceUrl.length > 0),
    {
      message: "sourceUrl is required when inputType is not FROM_SCRATCH",
      path: ["sourceUrl"],
    }
  )

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  pinned: z.boolean().optional(),
  status: z
    .enum(["DRAFT", "GENERATING", "READY", "DEPLOYING", "LIVE", "FAILED"])
    .optional(),
})

export const GenerateRequestSchema = z.object({
  projectId: z.string().cuid(),
  versionId: z.string().cuid(),
  startupIdea: z.string(),
  niche: z.string(),
  targetAudience: z.string(),
  inputType: ProjectInputTypeEnum,
  sourceUrl: z.string().url().optional(),
  scanResult: z.record(z.unknown()).optional(),
  modelId: ModelIdSchema.optional(),
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>
export type NicheCategory = z.infer<typeof NicheCategoryEnum>
export type ProjectInputType = z.infer<typeof ProjectInputTypeEnum>
