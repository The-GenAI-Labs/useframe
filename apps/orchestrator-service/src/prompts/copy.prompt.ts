export type CopyPromptVars = {
  copyFramework: string
  startupIdea: string
  niche: string
  targetAudience: string
  pageTitle: string
  pageType: string
  sectionType: string
  sectionIndex: number
}

export const DEFAULT_COPY_PROMPT = (v: CopyPromptVars): string => `
You are a conversion copywriter using the ${v.copyFramework} framework.

Startup: ${v.startupIdea}
Niche: ${v.niche}
Target Audience: ${v.targetAudience}
Page: ${v.pageTitle} (${v.pageType})
Section: ${v.sectionType} (position ${v.sectionIndex})

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
