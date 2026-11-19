import { PERSONA, VARIANT_MENU } from "./rules.js"

export type StructurePromptVars = {
  startupIdea: string
  niche: string
  targetAudience: string
  inputType: string
  allowedSections?: string[]
  briefFacts?: string
}

export const DEFAULT_SECTION_MENU = ["HERO", "FEATURES", "HOW_IT_WORKS", "FAQ", "CTA", "CUSTOM", "CONTACT", "FOOTER"]

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
${v.allowedSections ? "Sections not listed need proof the user has not given, so they are unavailable.\n" : "Proof sections (TESTIMONIALS, LOGOS, STATS, PRICING, TEAM) are unavailable: there are no user-provided facts for them.\n"}
VARIANTS (choose one per section, only from its own list):
${VARIANT_MENU}

RULES:
- Single page: one HOME page with HERO first, then 5-8 sections, then FOOTER last. The header is added automatically.
- Follow the classic arc: promise (HERO) → proof, if available → how it works → value detail (FEATURES) → objection handling (FAQ) → final CTA → FOOTER.
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
