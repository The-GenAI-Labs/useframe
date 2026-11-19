import { HONESTY_RULES, LIMITS_TEXT, WRITING_RULES } from "./rules.js"

export type IterateSectionPromptVars = {
  instruction: string
  sectionType: string
  variant?: string
  contract?: string
  currentContent: unknown
  pageTitle: string
  siteType: string
}

export const DEFAULT_ITERATE_SECTION_PROMPT = (v: IterateSectionPromptVars): string => `
Rewrite this ${v.sectionType}${v.variant ? ` (${v.variant})` : ""} section's content based on the instruction. Only change what the
instruction asks for and preserve everything else exactly as-is.

Page: ${v.pageTitle} (site type: ${v.siteType})
Instruction (from the site owner; facts they state here may be used): "${v.instruction}"
${v.contract ? `Content contract: ${v.contract}\n` : ""}
Current content:
${JSON.stringify(v.currentContent, null, 2)}

${LIMITS_TEXT}
${WRITING_RULES}
${HONESTY_RULES}

Respond with JSON for the updated content: { "eyebrow"?, "headline", "subheadline"?, "body"?, "cta"?: { "primary"?, "secondary"? }, "items"?: [{ "title", "description", "icon"? }] }
`.trim()
