import { generateText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { SiteSpec } from "@repo/schemas"
import type { GenerateRequest } from "@repo/schemas"
import {
  DEFAULT_SEO_PROMPT,
  type SeoPromptVars,
} from "@/prompts/seo.prompt.js"

export async function runSeoAgent(
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  promptFn: (vars: SeoPromptVars) => string = DEFAULT_SEO_PROMPT,
): Promise<Partial<SiteSpec>> {
  if (!spec.pages) return spec

  const updatedPages = []

  for (const page of spec.pages) {
    const prompt = promptFn({
      startupIdea: request.startupIdea,
      niche: request.niche,
      pageTitle: page.title,
      pageType: page.type,
      pageSlug: page.slug,
    })

    const { text } = await generateText({ model, prompt, maxTokens: 400 })

    let seo = {}
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) seo = JSON.parse(jsonMatch[0])
    } catch {
      seo = {
        title: `${page.title} | ${request.startupIdea.slice(0, 30)}`,
        description: request.startupIdea.slice(0, 155),
      }
    }

    updatedPages.push({ ...page, seo })
  }

  return { ...spec, pages: updatedPages }
}
