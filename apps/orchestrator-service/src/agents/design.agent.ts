import type { LanguageModelV1 } from "ai"
import type { Response } from "express"
import { z } from "zod"
import { sseWrite } from "@/llm/stream.js"
import { DesignTokensSchema, FONT_PAIRING_IDS, THEME_PRESETS, type GenerateRequest, type SiteSpec } from "@repo/schemas"
import { DEFAULT_DESIGN_PROMPT, type DesignPromptVars } from "@/prompts/design.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"
import { generateValidated } from "@/llm/structured.js"
import { colorIssues, designSystemFrom, fallbackDesign, fontsFor, themeFromBrief, type DesignChoice } from "@/lib/designTheme.js"

const HEX = z.string().regex(/^#[0-9a-fA-F]{6}$/, "6-digit hex like #1A7F5A")

export const DesignChoiceSchema = z.object({
  primaryColor: HEX,
  secondaryColor: HEX,
  accentColor: HEX,
  fontPairing: z.enum(FONT_PAIRING_IDS),
  theme: z.object({
    preset: z.enum(THEME_PRESETS),
    colorMode: z.enum(["light", "dark"]),
    ...DesignTokensSchema.shape,
  }),
  rationale: z.string(),
})

export async function runDesignAgent(
  res: Response,
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
  promptFn: (vars: DesignPromptVars) => string = DEFAULT_DESIGN_PROMPT,
): Promise<Partial<SiteSpec>> {
  sseWrite(res, {
    type: "stage",
    stage: "GENERATE",
    message: "Applying design system...",
  })

  // An approved DesignBrief's colours and type are grounded in research, so
  // they are used as-is; the theme comes from the brief or is derived from it.
  if (spec.designBrief) {
    const brief = spec.designBrief
    const theme = themeFromBrief(brief, request.niche)
    const base = designSystemFrom({ ...fallbackDesign(request.niche), theme })
    return {
      ...spec,
      theme,
      designSystem: {
        ...base,
        primaryColor: brief.colors.primary,
        secondaryColor: brief.colors.secondary,
        accentColor: brief.colors.accent,
        ...fontsFor(brief.fontPairing, brief.typography),
      },
      citations: brief.citations,
    }
  }

  const sectionPlan = spec.pages?.flatMap((p) => p.sections.map((s) => `${s.type}${s.variant ? `/${s.variant}` : ""}`)).join(", ")
  const { object, issues } = await generateValidated({
    model,
    schema: DesignChoiceSchema,
    prompt: promptFn({
      startupIdea: request.startupIdea,
      niche: request.niche,
      targetAudience: request.targetAudience,
      brandPersonality: request.brandPersonality,
      pricePositioning: request.pricePositioning,
      sectionPlan,
    }),
    providerOptions,
    maxTokens: 1500,
    functionId: "design-agent",
    validate: colorIssues,
  })

  // Schema-valid but with colour problems: keep the theme and fonts, swap the colours.
  const fallback = fallbackDesign(request.niche)
  const chosen: DesignChoice = !object
    ? fallback
    : issues.length === 0
      ? object
      : { ...object, primaryColor: fallback.primaryColor, secondaryColor: fallback.secondaryColor, accentColor: fallback.accentColor }
  if (!object || issues.length > 0) console.warn(`[design] fell back for ${object ? "colours" : "the whole design"} (${issues.length} issues)`)
  return { ...spec, theme: chosen.theme, designSystem: designSystemFrom(chosen) }
}
