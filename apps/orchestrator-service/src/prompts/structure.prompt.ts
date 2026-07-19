export type StructurePromptVars = {
  startupIdea: string
  niche: string
  targetAudience: string
  inputType: string
}

export const DEFAULT_STRUCTURE_PROMPT = (v: StructurePromptVars): string => `
You are a landing page architect. Given this startup:

Idea: ${v.startupIdea}
Niche: ${v.niche}
Target Audience: ${v.targetAudience}
Input Type: ${v.inputType}

Determine the optimal site structure. Respond ONLY with valid JSON matching this schema:
{
  "siteType": "SINGLE_PAGE" | "MULTI_PAGE",
  "copyFramework": "AIDA" | "PAS" | "FAB" | "PASTOR",
  "pages": [
    {
      "type": "HOME" | "ABOUT" | "CONTACT" | "PRICING" | "PRODUCT" | "RESEARCH" | "DEMO",
      "slug": "string",
      "title": "string",
      "sections": [
        { "type": "HERO"|"FEATURES"|"HOW_IT_WORKS"|"TESTIMONIALS"|"PRICING"|"CTA"|"FAQ"|"FOOTER", "index": 0 }
      ]
    }
  ]
}

Keep it focused. Single page sites: 1 HOME page with 5-7 sections. Multi page: 2-4 pages.
`.trim()
