import { PERSONA, THEME_MENU } from "./rules.js"

export type DesignPromptVars = {
  startupIdea: string
  niche: string
  targetAudience: string
  brandPersonality?: string
  pricePositioning?: string
  sectionPlan?: string
}

export const DEFAULT_DESIGN_PROMPT = (v: DesignPromptVars): string => `
${PERSONA}

Choose the complete visual system for this landing page.

Product: ${v.startupIdea}
Niche: ${v.niche}
Audience: ${v.targetAudience}
${v.brandPersonality ? `Brand personality: ${v.brandPersonality}\n` : ""}${v.pricePositioning ? `Price positioning: ${v.pricePositioning}\n` : ""}${v.sectionPlan ? `Sections: ${v.sectionPlan}\n` : ""}
COLOURS:
- primaryColor carries buttons and links: it must suit this niche and audience and hold readable text (white or near-black) at 4.5:1.
- accentColor is for small highlights and must be clearly distinct from the primary in hue.
- secondaryColor is a supporting tint or neutral partner to the primary.
- Do not default to indigo or purple-blue unless the brand truly calls for it. Use 6-digit hex.

${THEME_MENU}

Match the preset, tokens and font pairing to the audience: e.g. seniors and healthcare want airy density, high contrast and legible type;
luxury wants editorial calm; developer tools want precise, often dark themes; kids and families want soft, friendly shapes.
Give a rationale of at most two sentences.
`.trim()
