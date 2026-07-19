import { streamText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { Response } from "express"
import { sseWrite } from "@/llm/stream.js"
import type { SiteSpec, Section } from "@repo/schemas"
import type { GenerateRequest } from "@repo/schemas"
import {
  DEFAULT_COPY_PROMPT,
  type CopyPromptVars,
} from "@/prompts/copy.prompt.js"

export async function runCopyAgent(
  res: Response,
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  promptFn: (vars: CopyPromptVars) => string = DEFAULT_COPY_PROMPT,
): Promise<Partial<SiteSpec>> {
  if (!spec.pages) return spec

  const updatedPages = []

  for (const page of spec.pages) {
    const updatedSections: Section[] = []

    for (const section of page.sections) {
      const prompt = promptFn({
        copyFramework: spec.copyFramework ?? "AIDA",
        startupIdea: request.startupIdea,
        niche: request.niche,
        targetAudience: request.targetAudience,
        pageTitle: page.title,
        pageType: page.type,
        sectionType: section.type,
        sectionIndex: section.index,
      })

      const result = streamText({ model, prompt, maxTokens: 1000 })

      let fullText = ""
      for await (const chunk of result.textStream) {
        fullText += chunk
        sseWrite(res, { type: "token", delta: chunk })
      }

      let content: Section["content"] = {}
      try {
        const jsonMatch = fullText.match(/\{[\s\S]*\}/)
        if (jsonMatch) content = JSON.parse(jsonMatch[0])
      } catch {
        content = {
          headline: `${section.type} Section`,
          body: fullText.slice(0, 200),
        }
      }

      updatedSections.push({ ...section, content })

      sseWrite(res, {
        type: "section_complete",
        pageSlug: page.slug,
        sectionType: section.type,
        sectionIndex: section.index,
      })
    }

    updatedPages.push({ ...page, sections: updatedSections })
  }

  return { ...spec, pages: updatedPages }
}
