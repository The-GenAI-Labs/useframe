import { z } from "zod"

export const CitationSchema = z.object({
  id: z.string(),
  articleId: z.string().optional(),
  title: z.string(),
  source: z.string(),
  url: z.string().optional(),
  relevance: z.string().optional(),
  appliedTo: z.string().optional(),
})

export const SeoSchema = z.object({
  title: z.string(),
  description: z.string(),
  ogTitle: z.string().optional(),
  ogDescription: z.string().optional(),
  ogImageUrl: z.string().optional(),
  canonicalUrl: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  structuredData: z.record(z.unknown()).optional(),
})

export const SectionSchema = z.object({
  type: z.enum([
    "HERO",
    "FEATURES",
    "HOW_IT_WORKS",
    "TESTIMONIALS",
    "PRICING",
    "CTA",
    "FAQ",
    "TEAM",
    "CONTACT",
    "HEADER",
    "FOOTER",
    "CUSTOM",
  ]),
  index: z.number(),
  content: z
    .object({
      headline: z.string().optional(),
      subheadline: z.string().optional(),
      body: z.string().optional(),
      cta: z
        .object({
          primary: z.string().optional(),
          secondary: z.string().optional(),
          primaryHref: z.string().optional(),
          secondaryHref: z.string().optional(),
        })
        .optional(),
      items: z
        .array(
          z.object({
            title: z.string(),
            description: z.string(),
            icon: z.string().optional(),
          })
        )
        .optional(),
      mediaUrl: z.string().optional(),
      mediaAlt: z.string().optional(),
    })
    .optional(),
  citationIds: z.array(z.string()).optional(),
})

export const SiteSpecSchema = z.object({
  projectId: z.string().optional(),
  versionId: z.string().optional(),
  siteType: z.enum(["SINGLE_PAGE", "MULTI_PAGE"]),
  pages: z.array(
    z.object({
      type: z.enum([
        "HOME",
        "ABOUT",
        "CONTACT",
        "PRICING",
        "PRODUCT",
        "RESEARCH",
        "DEMO",
      ]),
      slug: z.string(),
      title: z.string(),
      sections: z.array(SectionSchema),
      seo: SeoSchema.optional(),
    })
  ),
  designSystem: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    accentColor: z.string(),
    fontPrimary: z.string(),
    fontSecondary: z.string(),
    spacing: z.string(),
    borderRadius: z.string(),
    animationStyle: z.string(),
  }),
  copyFramework: z.enum(["AIDA", "PAS", "FAB", "PASTOR"]),
  citations: z.array(CitationSchema),
})

export type SiteSpec = z.infer<typeof SiteSpecSchema>
export type Section = z.infer<typeof SectionSchema>
export type SeoMeta = z.infer<typeof SeoSchema>
export type Citation = z.infer<typeof CitationSchema>
export type SitePage = SiteSpec["pages"][number]
export type DesignSystem = SiteSpec["designSystem"]

export type SectionType = Section["type"]
export type PageType = SitePage["type"]
export type SiteType = SiteSpec["siteType"]
export type CopyFramework = SiteSpec["copyFramework"]

export type PipelineStage =
  | "RESEARCH"
  | "GENERATE"
  | "COPY"
  | "DESIGN"
  | "SEO"
  | "CRITIQUE"
  | "COMPLETE"
  | "FAILED"
  | "SCAN"

export type SSEStageEvent = {
  type: "stage"
  stage: PipelineStage
  message: string
}

export type SSETokenEvent = {
  type: "token"
  delta: string
}

export type SSESectionCompleteEvent = {
  type: "section_complete"
  pageSlug: string
  sectionType: string
  sectionIndex: number
}

export type SSEVersionReadyEvent = {
  type: "version_ready"
  versionId: string
  snapshot: SiteSpec
}

export type SSEProjectCreatedEvent = {
  type: "project_created"
  projectId: string
  versionId: string
  slug: string
}

export type SSEErrorEvent = {
  type: "error"
  message: string
}

export type SSEEvent =
  | SSEStageEvent
  | SSETokenEvent
  | SSESectionCompleteEvent
  | SSEVersionReadyEvent
  | SSEProjectCreatedEvent
  | SSEErrorEvent
