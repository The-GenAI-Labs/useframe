import { DATA_PARAGRAPH, dataBlock } from "@repo/media-ai"
import { HONESTY_RULES, LIMITS_TEXT, PERSONA, WRITING_RULES } from "./rules.js"

export type CopySectionPlan = {
  index: number
  type: string
  variant?: string
  purpose?: string
  contract: string
  mediaContext?: string
}

export type CopyPromptVars = {
  copyFramework: string
  frameworkRationale?: string
  startupIdea: string
  productName?: string
  niche: string
  targetAudience: string
  brandTone?: string
  pageTitle: string
  pageType: string
  sections: CopySectionPlan[]
  briefFacts?: string
  ctaLabel?: string
}

const EXAMPLES = `GOLD-STANDARD EXAMPLES (tone and density only; a fictional product called Brightdesk, booking software for dental clinics. Never copy their words):
{"index":0,"eyebrow":"For independent dental clinics","headline":"Fill every chair without phone tag","subheadline":"Brightdesk lets patients book, move and confirm visits online, and texts reminders so fewer appointments go empty.","cta":{"primary":"Start free trial","secondary":"See how it works"}}
{"index":2,"headline":"Less front-desk juggling, more time with patients","items":[{"title":"Booking in your own colours","description":"Patients pick a slot from your real calendar on any phone, with nothing to install.","icon":"calendar"},{"title":"Reminders that confirm themselves","description":"Texts go out two days and two hours before each visit; replies update the calendar.","icon":"message"},{"title":"A waitlist that fills gaps","description":"When someone cancels, the next patient on the waitlist is offered the slot straight away.","icon":"refresh"}]}`

export const DEFAULT_COPY_PROMPT = (v: CopyPromptVars): string => `
${PERSONA}

Write the copy for every section of this page in one pass, so the page reads as one story.

PRODUCT: ${v.productName ? `${v.productName} — ` : ""}${v.startupIdea}
NICHE: ${v.niche}
AUDIENCE: ${v.targetAudience}
${v.brandTone ? `TONE: ${v.brandTone}\n` : ""}FRAMEWORK: ${v.copyFramework}${v.frameworkRationale ? ` (why: ${v.frameworkRationale})` : ""}
PAGE: ${v.pageTitle} (${v.pageType})
${v.ctaLabel ? `PRIMARY CTA LABEL (use exactly): ${v.ctaLabel}\n` : ""}${v.briefFacts ? `\n${v.briefFacts}\n` : ""}
SECTIONS, in page order (write each one; "index" must match):
${v.sections
  .map(
    (s) =>
      `- index ${s.index}: ${s.type}${s.variant ? ` / ${s.variant}` : ""}${s.purpose ? ` — purpose: ${s.purpose}` : ""}\n  contract: ${s.contract}${
        s.mediaContext
          ? `\n  VISUALS: read-only context so the copy matches the images; the ${v.copyFramework} framework still decides structure and tone.\n${dataBlock("VISUALS", s.mediaContext)}`
          : ""
      }`,
  )
  .join("\n")}
${v.sections.some((s) => s.mediaContext) ? `\n${DATA_PARAGRAPH}\n` : ""}
${LIMITS_TEXT}

${WRITING_RULES}

${HONESTY_RULES}

${EXAMPLES}

Respond with JSON: { "primaryCta": "the one primary CTA label", "sections": [ { "index": 0, "eyebrow"?, "headline", "subheadline"?, "body"?, "cta"?: { "primary"?, "secondary"? }, "items"?: [{ "title", "description", "icon"? }] } ] }
Include only the fields each contract allows.
`.trim()
