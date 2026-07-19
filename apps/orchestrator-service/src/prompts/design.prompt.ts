export type DesignPromptVars = {
  startupIdea: string
  niche: string
  targetAudience: string
}

export const DEFAULT_DESIGN_PROMPT = (v: DesignPromptVars): string => `
You are an expert UI/UX designer specialising in landing pages.

Startup: ${v.startupIdea}
Niche: ${v.niche}
Target Audience: ${v.targetAudience}

Design a complete visual system for this landing page. Apply evidence-based colour psychology for the niche.
Respond ONLY with valid JSON — no prose, no markdown fences:
{
  "primaryColor": "#hex",
  "secondaryColor": "#hex",
  "accentColor": "#hex",
  "fontPrimary": "Google Font name",
  "fontSecondary": "Google Font name",
  "spacing": "comfortable" | "compact" | "spacious",
  "borderRadius": "none" | "sm" | "md" | "lg" | "full",
  "animationStyle": "none" | "subtle" | "moderate" | "energetic"
}
`.trim()
