export type SeoPromptVars = {
  startupIdea: string
  niche: string
  pageTitle: string
  pageType: string
  pageSlug: string
}

export const DEFAULT_SEO_PROMPT = (v: SeoPromptVars): string => `
You are an SEO expert. Write search-optimised metadata for this landing page.

Startup: ${v.startupIdea}
Niche: ${v.niche}
Page: ${v.pageTitle} (${v.pageType})
Page slug: /${v.pageSlug}

Respond ONLY with valid JSON — no prose, no markdown fences:
{
  "title": "string (50-60 chars, include primary keyword)",
  "description": "string (150-160 chars, include CTA)",
  "ogTitle": "string",
  "ogDescription": "string",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}
`.trim()
