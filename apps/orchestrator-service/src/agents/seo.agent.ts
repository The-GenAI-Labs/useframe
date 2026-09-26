import { generateText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { SiteSpec } from "@repo/schemas"
import { SeoSchema } from "@repo/schemas"
import type { GenerateRequest } from "@repo/schemas"
import {
  DEFAULT_SEO_PROMPT,
  type SeoPromptVars,
} from "@/prompts/seo.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"

export async function runSeoAgent(
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
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

    const { text } = await generateText({
      model,
      prompt,
      maxTokens: 400,
      providerOptions,
      experimental_telemetry: { isEnabled: true, functionId: "seo-agent" },
    })

    let seo = {
      title: `${page.title} | ${request.startupIdea.slice(0, 30)}`,
      description: request.startupIdea.slice(0, 155),
    }
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = SeoSchema.safeParse(JSON.parse(jsonMatch[0]))
        if (parsed.success) seo = parsed.data
      }
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
