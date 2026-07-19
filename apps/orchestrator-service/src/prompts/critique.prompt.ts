export type CritiquePromptVars = {
  specSummary: string
  startupIdea: string
  niche: string
  targetAudience: string
}

export const DEFAULT_CRITIQUE_PROMPT = (v: CritiquePromptVars): string => `
You are a conversion rate optimisation expert. Review this landing page spec:

${v.specSummary}

Context:
- Startup: ${v.startupIdea}
- Niche: ${v.niche}
- Target Audience: ${v.targetAudience}

Identify critical incoherence: mismatched tone, missing key sections, weak CTAs, or design/copy conflicts.
Respond ONLY with a JSON object of targeted patches. Use an empty array if no changes are needed:
{
  "patches": [
    {
      "pageSlug": "string",
      "sectionIndex": 0,
      "field": "content.headline | content.cta.primary | content.body",
      "value": "new value"
    }
  ]
}
`.trim()
