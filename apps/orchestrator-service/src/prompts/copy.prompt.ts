import { DATA_PARAGRAPH, dataBlock } from "@repo/media-ai"

export type CopyPromptVars = {
  copyFramework: string
  startupIdea: string
  niche: string
  targetAudience: string
  pageTitle: string
  pageType: string
  sectionType: string
  sectionIndex: number
  brandTone?: string
  frameworkRationale?: string
  briefFacts?: string
  mediaContext?: string
}

export const DEFAULT_COPY_PROMPT = (v: CopyPromptVars): string => `
You are a conversion copywriter using the ${v.copyFramework} framework.
${v.frameworkRationale ? `Why this framework was chosen: ${v.frameworkRationale}\n` : ""}
Startup: ${v.startupIdea}
Niche: ${v.niche}
Target Audience: ${v.targetAudience}
${v.brandTone ? `Brand tone to match: ${v.brandTone}\n` : ""}Page: ${v.pageTitle} (${v.pageType})
Section: ${v.sectionType} (position ${v.sectionIndex})
${v.briefFacts ? `\n${v.briefFacts}\n` : ""}${v.mediaContext ? `\nVISUALS: read-only context so the copy matches the images; the ${v.copyFramework} framework still decides structure and tone.\n${DATA_PARAGRAPH}\n${dataBlock("VISUALS", v.mediaContext)}\n` : ""}
Write compelling copy for this section. Respond ONLY with valid JSON:
{
  "headline": "string",
  "subheadline": "string (optional)",
  "body": "string (optional)",
  "cta": {
    "primary": "string (optional)",
    "secondary": "string (optional)"
  },
  "items": [{ "title": "string", "description": "string" }]
}

The items array is required for FEATURES, HOW_IT_WORKS, FAQ, TESTIMONIALS sections.
Omit it for HERO, CTA, FOOTER sections.
`.trim()
