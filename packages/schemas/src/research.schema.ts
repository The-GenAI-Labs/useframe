import { z } from "zod"

export const ScannedCompetitorSchema = z.object({
  sourceUrl: z.string(),
  designTokens: z.unknown().optional(),
  extractedContent: z.unknown().optional(),
})

export const ResearchAgentRequestSchema = z.object({
  startupIdea: z.string().min(3).max(2000),
  niche: z.string(),
  targetAudience: z.string(),
  feedback: z.string().max(2000).optional(),
  previousReport: z.record(z.string(), z.unknown()).optional(),
  scannedCompetitors: z.array(ScannedCompetitorSchema).optional(),
})

export const ResearchReportDataSchema = z.object({
  summary: z.string(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  accentColor: z.string(),
  colorPalette: z.record(z.string(), z.unknown()),
  colorRationale: z.string(),
  fontPrimary: z.string(),
  fontSecondary: z.string(),
  typographyRationale: z.string(),
  layoutStyle: z.string(),
  layoutRationale: z.string(),
  imageStyle: z.string(),
  imageDirection: z.record(z.string(), z.unknown()),
  imageRationale: z.string(),
  animationStyle: z.string().optional(),
  targetAgeGroup: z.string().optional(),
  toneOfVoice: z.string().optional(),
  seoKeywords: z.array(z.string()).optional(),
  competitorInsights: z.record(z.string(), z.unknown()).optional(),
  citations: z.array(z.record(z.string(), z.unknown())),
  confidenceScore: z.number().min(0).max(100).optional(),
})

export type ResearchAgentRequest = z.infer<typeof ResearchAgentRequestSchema>
export type ScannedCompetitor = z.infer<typeof ScannedCompetitorSchema>
export type ResearchReportData = z.infer<typeof ResearchReportDataSchema>
