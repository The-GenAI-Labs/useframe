export type ScorePromptVars = {
  url: string
  extractedContent: unknown
  designTokens: unknown
}

export const DEFAULT_SCORE_PROMPT = (v: ScorePromptVars): string => `
You are a website design and conversion auditor. You are given a screenshot of a live
webpage (${v.url}) along with extracted DOM content and computed CSS design tokens. Score
the page across the 5 criteria below, each 0-100. Be specific and reference what you
actually see in the screenshot and data, not generic advice.

Extracted content:
${JSON.stringify(v.extractedContent, null, 2)}

Design tokens (computed styles):
${JSON.stringify(v.designTokens, null, 2)}

Criteria:

1. visualHierarchy — Primary CTA is visually dominant (size, color, position). Heading
   hierarchy is logical (H1 → H2 → body). Reading flow follows an F-pattern or Z-pattern.
   Sufficient whitespace between sections. Above-the-fold communicates the value
   proposition.

2. typographyReadability — Body font size ≥16px. Line length 50-75 characters. Line
   height 1.4-1.6. Sufficient contrast between heading and body weights. Max 2 font
   families used.

3. colorContrastA11y — Text/background contrast ratio ≥4.5:1 (WCAG AA). CTA button
   contrast ≥3:1 against its background. Color alone is not used to convey information.
   No more than 4-5 colours in the palette. Primary colour aligns with brand/niche
   psychology.

4. copyPersuasion — Headline directly states the value proposition. Subheadline
   addresses the primary pain point. CTA text is action-oriented (verb + benefit). Social
   proof is present (testimonials, logos, numbers). Objection handling is visible before
   the CTA.

5. seoTechnical — Title tag 30-60 characters, contains a primary keyword. Meta
   description 120-160 characters. H1 present and unique. OG tags present (og:title,
   og:description, og:image). No broken structure in heading hierarchy.

Respond ONLY with valid JSON matching this schema exactly:
{
  "visualHierarchy": { "score": 0, "explanation": "string (2 sentences)", "citation": "string (a research finding supporting your judgment)", "issues": ["string", "up to 3"] },
  "typographyReadability": { "score": 0, "explanation": "string", "citation": "string", "issues": ["string"] },
  "colorContrastA11y": { "score": 0, "explanation": "string", "citation": "string", "issues": ["string"] },
  "copyPersuasion": { "score": 0, "explanation": "string", "citation": "string", "issues": ["string"] },
  "seoTechnical": { "score": 0, "explanation": "string", "citation": "string", "issues": ["string"] },
  "overallScore": 0
}
`.trim()
