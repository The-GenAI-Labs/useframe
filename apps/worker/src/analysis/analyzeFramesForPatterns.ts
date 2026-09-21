import { generateObject } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import { env } from "../config/env.js"

// Structured ANALYSIS, never raw content. The schema shape is itself half of
// the guardrail: there is no field for verbatim copy or literal image
// description, so even a prompt-ignoring model has nowhere to put them.
export const CompetitorAnalysisSchema = z.object({
  layoutStructure: z.string(),
  typography: z.string(),
  spacing: z.string(),
  colorPalette: z.array(z.string()), // approximate hex values observed
  components: z.array(z.string()), // "sticky nav", "bento grid", "testimonial carousel"
  visualHierarchy: z.string(),
  uxPatterns: z.array(z.string()),
  motionPatterns: z.array(z.string()), // "fade-up on scroll", "parallax hero", "sticky CTA bar"
  overallImpression: z.string(),
})

export type CompetitorAnalysis = z.infer<typeof CompetitorAnalysisSchema>

const SYSTEM_PROMPT = `You are a design analyst reviewing a sequence of frames captured while scrolling through a real website, in chronological order.

Produce a structured analysis of the DESIGN PATTERNS you observe: layout structure, typography choices, spacing/rhythm, color palette, UI components used, visual hierarchy, UX patterns, and animation/motion you can infer from how elements change across the frame sequence (fades, slides, parallax, sticky elements, reveal-on-scroll).

HARD RULES:
- This is for INSPIRATION and PATTERN RECOGNITION only.
- Do NOT transcribe exact copy text verbatim — describe the TYPE of message ("problem-focused headline", "benefit-led subheadline"), never the literal words.
- Do NOT describe images in literally-reproducible detail — describe their STYLE and PURPOSE ("a soft-lit product photo used as a trust signal"), never specifics that could be used to recreate the exact image.
- You are identifying patterns a designer could learn from, not writing instructions to copy this site.`

// Always Claude here, regardless of the requesting user's free/paid tier —
// this is a small, bounded, internal research call that runs at most once per
// project, so it doesn't scale per-generation the way user-facing agents do.
const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" })

// ANTHROPIC_API_KEY is optional in the worker's env schema, so the caller
// checks this before recording a video it would then be unable to analyze.
export function isVisionAnalysisAvailable(): boolean {
  return !!env.ANTHROPIC_API_KEY
}

export async function analyzeFramesForPatterns(
  frames: Buffer[],
  sourceUrl: string,
): Promise<CompetitorAnalysis> {
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: CompetitorAnalysisSchema,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...frames.map((f) => ({ type: "image" as const, image: f })),
          {
            type: "text" as const,
            text: `Analyze this sequence of frames from ${sourceUrl}.`,
          },
        ],
      },
    ],
    experimental_telemetry: { isEnabled: true, functionId: "competitor-video-analysis" },
  })

  return object
}
