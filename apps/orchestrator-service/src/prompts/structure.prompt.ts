import { PERSONA, VARIANT_MENU } from "./rules.js"

export type StructurePromptVars = {
  startupIdea: string
  niche: string
  targetAudience: string
  inputType: string
  allowedSections?: string[]
  // The business type's narrative arc (sections in order), from code.
  arc?: string
  briefFacts?: string
}

export const DEFAULT_SECTION_MENU = ["HERO", "FEATURES", "HOW_IT_WORKS", "FAQ", "CTA", "FOOTER"]

export const DEFAULT_STRUCTURE_PROMPT = (v: StructurePromptVars): string => {
  const menu = (v.allowedSections ?? DEFAULT_SECTION_MENU).filter((t) => t !== "HEADER")
  return `
${PERSONA}

Plan the structure of this landing page.

Idea: ${v.startupIdea}
Niche: ${v.niche}
Target audience: ${v.targetAudience}
Input type: ${v.inputType}

SECTION TYPES you may use (no others): ${menu.join(", ")}
Proof sections (TESTIMONIALS, LOGOS, STATS, PRICING, TEAM), CONTACT and CUSTOM appear only when listed: they need facts the user supplied.

${v.arc ?? "NARRATIVE ARC: promise (HERO) → how it works → value detail (FEATURES) → objection handling (FAQ) → final CTA → FOOTER."}

VARIANTS (choose one per section, only from its own list):
${VARIANT_MENU}

RULES:
- The home page uses exactly the arc's sections in the arc's order, then FOOTER. The header is added automatically.
- A suggested variant is a starting point; pick another from the same list if it suits this product better.
- Two neighbouring sections must not use the same layout (e.g. a card grid next to another card grid).
- Each section gets a one-line purpose: the job it does for this visitor, specific to this product (max 140 characters).
- Multi page only when the product clearly needs separate pages (2-4 pages, each with its own HERO-like opener).
- copyFramework: AIDA, PAS, FAB or PASTOR, whichever suits this audience's awareness level.

Respond with JSON:
{
  "siteType": "SINGLE_PAGE" | "MULTI_PAGE",
  "copyFramework": "AIDA" | "PAS" | "FAB" | "PASTOR",
  "pages": [
    { "type": "HOME" | "ABOUT" | "CONTACT" | "PRICING" | "PRODUCT" | "RESEARCH" | "DEMO", "slug": "home", "title": "string",
      "sections": [{ "type": "HERO", "variant": "split", "purpose": "string" }] }
  ]
}
${v.briefFacts ? `\n${v.briefFacts}` : ""}
`.trim()
}
