import { generateText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { Response } from "express"
import { sseWrite } from "@/llm/stream.js"
import type { SiteSpec } from "@repo/schemas"
import type { GenerateRequest } from "@repo/schemas"
import {
  DEFAULT_DESIGN_PROMPT,
  type DesignPromptVars,
} from "@/prompts/design.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"

const FALLBACK_DESIGN_SYSTEM: SiteSpec["designSystem"] = {
  primaryColor: "#6366f1",
  secondaryColor: "#1e1b4b",
  accentColor: "#a5b4fc",
  fontPrimary: "Inter",
  fontSecondary: "DM Sans",
  spacing: "comfortable",
  borderRadius: "md",
  animationStyle: "subtle",
}

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

  // When a DesignBrief was approved via the Research step, its colors and
  // typography are already grounded in retrieved research — copy them
  // directly instead of asking the model to invent a design system from
  // scratch. spacing/borderRadius aren't part of the brief, so they keep
  // sane fallback defaults either way.
  if (spec.designBrief) {
    const brief = spec.designBrief
    return {
      ...spec,
      designSystem: {
        ...FALLBACK_DESIGN_SYSTEM,
        primaryColor: brief.colors.primary,
        secondaryColor: brief.colors.secondary,
        accentColor: brief.colors.accent,
        fontPrimary: brief.typography.primary,
        fontSecondary: brief.typography.secondary,
        animationStyle: brief.motion,
      },
      citations: brief.citations,
    }
  }

  const prompt = promptFn({
    startupIdea: request.startupIdea,
    niche: request.niche,
    targetAudience: request.targetAudience,
  })

  const { text } = await generateText({
    model,
    prompt,
    maxTokens: 500,
    providerOptions,
    experimental_telemetry: { isEnabled: true, functionId: "design-agent" },
  })

  let designSystem = FALLBACK_DESIGN_SYSTEM
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      designSystem = { ...FALLBACK_DESIGN_SYSTEM, ...parsed }
    }
  } catch {
  }

  return { ...spec, designSystem }
}
