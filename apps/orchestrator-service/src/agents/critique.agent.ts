import { generateText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { SiteSpec } from "@repo/schemas"
import type { GenerateRequest } from "@repo/schemas"
import {
  DEFAULT_CRITIQUE_PROMPT,
  type CritiquePromptVars,
} from "@/prompts/critique.prompt.js"

export async function runCritiqueAgent(
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  promptFn: (vars: CritiquePromptVars) => string = DEFAULT_CRITIQUE_PROMPT,
): Promise<Partial<SiteSpec>> {
  const specSummary = JSON.stringify({
    siteType: spec.siteType,
    copyFramework: spec.copyFramework,
    pages: spec.pages?.map((p) => ({
      type: p.type,
      slug: p.slug,
      sections: p.sections.map((s) => ({
        type: s.type,
        headline: s.content?.headline,
      })),
    })),
    designSystem: spec.designSystem,
  })

  const prompt = promptFn({
    specSummary,
    startupIdea: request.startupIdea,
    niche: request.niche,
    targetAudience: request.targetAudience,
  })

  const { text } = await generateText({ model, prompt, maxTokens: 800 })

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return spec
    const { patches } = JSON.parse(jsonMatch[0])
    if (!Array.isArray(patches) || patches.length === 0) return spec

    const patchedPages = (spec.pages ?? []).map((page) => {
      const relevantPatches = patches.filter(
        (p: { pageSlug: string }) => p.pageSlug === page.slug,
      )
      if (relevantPatches.length === 0) return page

      const patchedSections = page.sections.map((section) => {
        const sectionPatches = relevantPatches.filter(
          (p: { sectionIndex: number }) => p.sectionIndex === section.index,
        )
        if (sectionPatches.length === 0) return section

        let patchedSection = { ...section, content: { ...section.content } }
        for (const patch of sectionPatches as {
          field: string
          value: string
        }[]) {
          const parts = patch.field.split(".")
          if (parts[0] === "content" && parts.length === 2 && parts[1]) {
            patchedSection.content = {
              ...patchedSection.content,
              [parts[1]]: patch.value,
            }
          }
        }
        return patchedSection
      })

      return { ...page, sections: patchedSections }
    })

    return { ...spec, pages: patchedPages }
  } catch {
    return spec
  }
}
