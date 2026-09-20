export type IterateSectionPromptVars = {
  instruction: string
  sectionType: string
  currentContent: unknown
  pageTitle: string
  siteType: string
}

export const DEFAULT_ITERATE_SECTION_PROMPT = (v: IterateSectionPromptVars): string => `
Rewrite this ${v.sectionType} section's content based on the instruction. Keep the same JSON
structure as the current content. Only change what the instruction asks for — preserve
everything else exactly as-is.

Page: ${v.pageTitle} (site type: ${v.siteType})
Instruction: "${v.instruction}"

Current content:
${JSON.stringify(v.currentContent, null, 2)}

Respond ONLY with valid JSON for the updated content object, matching this schema:
{
  "headline": "string (optional)",
  "subheadline": "string (optional)",
  "body": "string (optional)",
  "cta": {
    "primary": "string (optional)",
    "secondary": "string (optional)"
  },
  "items": [{ "title": "string", "description": "string" }]
}
`.trim()
