import { z } from "zod"
import { SiteSpecSchema } from "./siteSpec.js"

export const SeoMaterializeRequestSchema = z.object({
  spec: SiteSpecSchema,
  startupIdea: z.string(),
  niche: z.string(),
  baseUrl: z.string().url(),
})

export const KeywordValidationSchema = z.object({
  pageSlug: z.string(),
  declaredKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  pass: z.boolean(),
})

export const SeoMaterializeResponseSchema = z.object({
  spec: SiteSpecSchema,
  robotsTxt: z.string(),
  sitemapXml: z.string(),
  keywordValidation: z.array(KeywordValidationSchema),
})

export type SeoMaterializeRequest = z.infer<typeof SeoMaterializeRequestSchema>
export type SeoMaterializeResponse = z.infer<typeof SeoMaterializeResponseSchema>
export type KeywordValidation = z.infer<typeof KeywordValidationSchema>
