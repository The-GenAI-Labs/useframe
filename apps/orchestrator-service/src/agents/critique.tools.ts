import { tool } from "ai"
import { z } from "zod"
import type { SiteSpec, DesignBrief } from "@repo/schemas"
import { wcagContrastRatio } from "@/lib/contrast.js"
import { checkHeadings, measureCopy, diffSpecAgainstBrief, checkCtas } from "@/lib/critiqueChecks.js"

// TOOLS (exact, deterministic): contrast · heading hierarchy · copy length · brief compliance · CTA presence
// LLM (judgment only): tone coherence · narrative flow · redundancy
//
// Tool execute() closes over spec/brief rather than using AI SDK "tool call
// context" — this installed AI SDK version (v4.x) has no experimental_context
// mechanism, confirmed against its actual type definitions before writing
// this file.
export function makeCritiqueTools(spec: Partial<SiteSpec>, brief: DesignBrief | null | undefined) {
  const checkContrast = tool({
    description: "Compute WCAG contrast ratio between two hex colors",
    parameters: z.object({ foreground: z.string(), background: z.string() }),
    execute: async ({ foreground, background }) => {
      const ratio = wcagContrastRatio(foreground, background)
      return { ratio, passesAA: ratio >= 4.5, passesAAA: ratio >= 7 }
    },
  })

  const validateHeadingHierarchy = tool({
    description: "Check H1 uniqueness and that a page has headline content",
    parameters: z.object({ pageSlug: z.string() }),
    execute: async ({ pageSlug }) => checkHeadings(spec, pageSlug),
  })

  const measureCopyLength = tool({
    description: "Character count for a section's headline/body; flags sections that are too long",
    parameters: z.object({ pageSlug: z.string(), sectionIndex: z.number() }),
    execute: async ({ pageSlug, sectionIndex }) => measureCopy(spec, pageSlug, sectionIndex),
  })

  const checkBriefCompliance = tool({
    description: "Verify the spec's colors, fonts, and section order match the approved DesignBrief exactly",
    parameters: z.object({}),
    execute: async () => diffSpecAgainstBrief(spec, brief),
  })

  const checkCtaConsistency = tool({
    description: "Verify every page has exactly one primary CTA and its wording is consistent",
    parameters: z.object({}),
    execute: async () => checkCtas(spec),
  })

  return {
    checkContrast,
    validateHeadingHierarchy,
    measureCopyLength,
    checkBriefCompliance,
    checkCtaConsistency,
  }
}
