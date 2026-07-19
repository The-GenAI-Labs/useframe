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

export async function runDesignAgent(
  res: Response,
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  promptFn: (vars: DesignPromptVars) => string = DEFAULT_DESIGN_PROMPT,
): Promise<Partial<SiteSpec>> {
  const prompt = promptFn({
    startupIdea: request.startupIdea,
    niche: request.niche,
    targetAudience: request.targetAudience,
  })

  sseWrite(res, {
    type: "stage",
    stage: "GENERATE",
    message: "Applying design system...",
  })

  const { text } = await generateText({ model, prompt, maxTokens: 500 })

  const fallback: SiteSpec["designSystem"] = {
    primaryColor: "#6366f1",
    secondaryColor: "#1e1b4b",
    accentColor: "#a5b4fc",
    fontPrimary: "Inter",
    fontSecondary: "DM Sans",
    spacing: "comfortable",
    borderRadius: "md",
    animationStyle: "subtle",
  }

  let designSystem = fallback
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      designSystem = { ...fallback, ...parsed }
    }
  } catch {
    // use fallback
  }

  return { ...spec, designSystem }
}
