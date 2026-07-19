import { streamText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { Response } from "express"
import { sseWrite } from "@/llm/stream.js"
import type { SiteSpec } from "@repo/schemas"
import type { GenerateRequest } from "@repo/schemas"
import {
  DEFAULT_STRUCTURE_PROMPT,
  type StructurePromptVars,
} from "@/prompts/structure.prompt.js"

export async function runStructureAgent(
  res: Response,
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  promptFn: (vars: StructurePromptVars) => string = DEFAULT_STRUCTURE_PROMPT,
): Promise<Partial<SiteSpec>> {
  const prompt = promptFn({
    startupIdea: request.startupIdea,
    niche: request.niche,
    targetAudience: request.targetAudience,
    inputType: request.inputType,
  })

  const result = streamText({ model, prompt, maxTokens: 2000 })

  let fullText = ""
  for await (const chunk of result.textStream) {
    fullText += chunk
    sseWrite(res, { type: "token", delta: chunk })
  }

  try {
    const jsonMatch = fullText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON in structure response")
    const parsed = JSON.parse(jsonMatch[0])

    return {
      ...spec,
      siteType: parsed.siteType ?? "SINGLE_PAGE",
      copyFramework: parsed.copyFramework ?? "AIDA",
      pages: (parsed.pages ?? []).map(
        (p: {
          type: string
          slug: string
          title: string
          sections: Array<{ type: string; index: number }>
        }) => ({
          type: p.type,
          slug: p.slug,
          title: p.title,
          sections: (p.sections ?? []).map(
            (s: { type: string; index: number }) => ({
              type: s.type,
              index: s.index,
            }),
          ),
        }),
      ),
      citations: [],
    }
  } catch {
    return {
      ...spec,
      siteType: "SINGLE_PAGE",
      copyFramework: "AIDA",
      pages: [
        {
          type: "HOME",
          slug: "home",
          title: "Home",
          sections: [
            { type: "HERO", index: 0 },
            { type: "FEATURES", index: 1 },
            { type: "HOW_IT_WORKS", index: 2 },
            { type: "CTA", index: 3 },
            { type: "FOOTER", index: 4 },
          ],
        },
      ],
      citations: [],
    }
  }
}
