import { generateText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { SiteSpec } from "@repo/schemas"
import type { GenerateRequest } from "@repo/schemas"
import { makeCritiqueTools } from "./critique.tools.js"
import {
  DEFAULT_CRITIQUE_PROMPT,
  type CritiquePromptVars,
} from "@/prompts/critique.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"

type CritiqueIssue = {
  pageSlug: string
  sectionIndex: number
  issue: string
  field: "headline" | "subheadline" | "body" | "cta.primary"
  fix: string
}

export async function runCritiqueAgent(
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
  promptFn: (vars: CritiquePromptVars) => string = DEFAULT_CRITIQUE_PROMPT,
): Promise<Partial<SiteSpec>> {
  const specSummary = JSON.stringify({
    siteType: spec.siteType,
    copyFramework: spec.copyFramework,
    pages: spec.pages?.map((p) => ({
      slug: p.slug,
      sections: p.sections.map((s) => ({
        index: s.index,
        type: s.type,
        headline: s.content?.headline,
        body: s.content?.body,
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

  const { text } = await generateText({
    model,
    tools: makeCritiqueTools(spec, spec.designBrief),
    maxSteps: 8,
    system: `You review a generated landing page for real issues.
USE TOOLS for anything measurable — contrast, heading structure, copy length, brief compliance, CTAs.
DO NOT estimate these yourself; call the relevant tool instead.
Only use your own judgment for: does the copy tone match the brand tone, is the narrative coherent
across sections, is any section redundant with another.
After checking, respond ONLY with valid JSON: { "issues": [{ "pageSlug": "string", "sectionIndex": 0,
"issue": "string", "field": "headline | subheadline | body | cta.primary",
"fix": "string (the replacement value for that field)" }] }.
Use an empty array if there are no real problems. Do not invent issues to seem thorough.`,
    prompt,
    providerOptions,
    experimental_telemetry: { isEnabled: true, functionId: "critique-agent" },
  })

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return spec
    const { issues } = JSON.parse(jsonMatch[0]) as { issues?: CritiqueIssue[] }
    if (!Array.isArray(issues) || issues.length === 0) return spec

    const patchedPages = (spec.pages ?? []).map((page) => {
      const relevant = issues.filter((i) => i.pageSlug === page.slug)
      if (relevant.length === 0) return page

      const patchedSections = page.sections.map((section) => {
        const sectionIssues = relevant.filter((i) => i.sectionIndex === section.index)
        if (sectionIssues.length === 0) return section

        let content = { ...section.content }
        for (const { field, fix } of sectionIssues) {
          if (field === "cta.primary") {
            content = { ...content, cta: { ...content.cta, primary: fix } }
          } else {
            content = { ...content, [field]: fix }
          }
        }
        return { ...section, content }
      })

      return { ...page, sections: patchedSections }
    })

    return { ...spec, pages: patchedPages }
  } catch {
    return spec
  }
}
