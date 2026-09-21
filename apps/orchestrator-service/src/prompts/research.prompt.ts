export type ScannedCompetitor = {
  sourceUrl: string
  designTokens?: unknown
  extractedContent?: unknown
  // Structured design-pattern analysis derived from a scroll-through screen
  // recording. Present for the top-ranked competitor only. Contains patterns
  // (layout, motion, hierarchy), never verbatim copy or reproducible image
  // detail — see CompetitorAnalysisSchema in the worker.
  videoAnalysis?: unknown
}

export type ResearchPromptVars = {
  startupIdea: string
  niche: string
  targetAudience: string
  feedback?: string
  previousReport?: Record<string, unknown>
  scannedCompetitors?: ScannedCompetitor[]
}

export const DEFAULT_RESEARCH_PROMPT = (v: ResearchPromptVars): string => `
You are a design researcher producing an evidence-backed design brief for a landing page.

Startup idea: "${v.startupIdea}"
Niche: ${v.niche}
Target audience: ${v.targetAudience}

${
  v.previousReport
    ? `A previous version of this research report was produced:\n${JSON.stringify(v.previousReport)}\n`
    : ""
}
${
  v.feedback
    ? `The user reviewed that report and gave this feedback — revise accordingly:\n"${v.feedback}"\n`
    : ""
}
${
  v.scannedCompetitors && v.scannedCompetitors.length > 0
    ? `Real competitor websites were scanned. Use this ACTUAL extracted data — do not invent
competitor details beyond what's given here — to populate "competitorInsights" with concrete
observations (e.g. common headline patterns, CTA phrasing, color/typography choices actually
observed, structural patterns):\n${v.scannedCompetitors
        .map(
          (c, i) =>
            `Competitor ${i + 1} (${c.sourceUrl}):\ndesignTokens: ${JSON.stringify(c.designTokens ?? {})}\nextractedContent: ${JSON.stringify(c.extractedContent ?? {})}${
              c.videoAnalysis
                ? `\nobservedPatterns (from a scroll-through recording — design patterns to LEARN FROM as inspiration, never to replicate; do not reproduce their copy or imagery): ${JSON.stringify(c.videoAnalysis)}`
                : ""
            }`,
        )
        .join("\n\n")}\n`
    : `No competitor scan data is available — omit "competitorInsights" entirely rather than inventing it.\n`
}

Produce a design research brief: a color palette (with psychological rationale), typography
choices (with readability/brand rationale), a layout style recommendation (with a rationale
grounded in UX research), imagery direction, and — when you can point to a specific finding —
citations backing your claims (e.g. "Nielsen Norman Group", "Cialdini's principles of persuasion",
established UX/color-psychology research). Include a confidenceScore (0-100) reflecting how
well-grounded these recommendations are versus generic assumptions.

Respond ONLY with valid JSON matching this schema:
{
  "summary": "string (2-3 sentence overview of the design direction)",
  "primaryColor": "string (hex)",
  "secondaryColor": "string (hex)",
  "accentColor": "string (hex)",
  "colorPalette": { "...": "additional named colors as hex, object" },
  "colorRationale": "string",
  "fontPrimary": "string (a real Google Font name)",
  "fontSecondary": "string (a real Google Font name)",
  "typographyRationale": "string",
  "layoutStyle": "string (e.g. 'Single-page AIDA scroll')",
  "layoutRationale": "string",
  "imageStyle": "string (e.g. 'Warm editorial photography')",
  "imageDirection": { "mood": "string", "subjects": "string" },
  "imageRationale": "string",
  "animationStyle": "string (optional)",
  "targetAgeGroup": "string (optional)",
  "toneOfVoice": "string (optional)",
  "seoKeywords": ["string", "..."] (optional),
  "competitorInsights": { "...": "..." } (optional),
  "citations": [{ "claim": "string", "source": "string" }],
  "confidenceScore": number (0-100)
}
`.trim()
