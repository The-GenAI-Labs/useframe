import { generateText } from "ai"
import type { SiteSpec, IterateRequest, IterateChange } from "@repo/schemas"
import { getModel } from "@/llm/providers.js"
import {
  DEFAULT_ITERATE_PLAN_PROMPT,
} from "@/prompts/iteratePlan.prompt.js"
import {
  DEFAULT_ITERATE_SECTION_PROMPT,
} from "@/prompts/iterateSection.prompt.js"

export type IterateResult = {
  updatedSpec: SiteSpec
  summary: string
  changed: boolean
  editSize: "minor" | "major"
}

type IteratePlan = {
  changes: IterateChange[]
  editSize: "minor" | "major"
  summary: string
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("No JSON found in LLM response")
  return JSON.parse(match[0])
}

export async function runIteration(request: IterateRequest): Promise<IterateResult> {
  const model = getModel(request.modelId)
  const spec = request.currentSpec

  const planPrompt = DEFAULT_ITERATE_PLAN_PROMPT({
    instruction: request.instruction,
    siteType: spec.siteType,
    pages: spec.pages.map((p: SiteSpec["pages"][number]) => ({
      slug: p.slug,
      type: p.type,
      title: p.title,
      sections: p.sections.map((s) => ({ type: s.type, index: s.index })),
    })),
  })

  const planResult = await generateText({
    model,
    prompt: planPrompt,
    maxTokens: 1500,
    experimental_telemetry: { isEnabled: true, functionId: "iterate-agent-plan" },
  })
  const plan = extractJson(planResult.text) as IteratePlan

  if (!plan.changes || plan.changes.length === 0) {
    return {
      updatedSpec: spec,
      summary: plan.summary ?? "No changes needed for that instruction.",
      changed: false,
      editSize: plan.editSize ?? "minor",
    }
  }

  const updatedSpec: SiteSpec = structuredClone(spec)

  for (const change of plan.changes) {
    const page = updatedSpec.pages.find((p) => p.slug === change.pageSlug)
    if (!page) continue
    const section = page.sections.find(
      (s) => s.type === change.sectionType && s.index === change.sectionIndex
    )
    if (!section) continue

    const sectionPrompt = DEFAULT_ITERATE_SECTION_PROMPT({
      instruction: change.instruction,
      sectionType: section.type,
      currentContent: section.content ?? {},
      pageTitle: page.title,
      siteType: updatedSpec.siteType,
    })

    const sectionResult = await generateText({
      model,
      prompt: sectionPrompt,
      maxTokens: 1000,
      experimental_telemetry: { isEnabled: true, functionId: "iterate-agent-section" },
    })

    try {
      section.content = extractJson(sectionResult.text) as typeof section.content
    } catch {
      // Leave the section's existing content untouched if the model's
      // response wasn't valid JSON — better to no-op this one section
      // than to corrupt it with partial/garbage content.
    }
  }

  return {
    updatedSpec,
    summary: plan.summary ?? `Updated ${plan.changes.map((c) => c.sectionType).join(", ")}.`,
    changed: true,
    editSize: plan.editSize ?? (plan.changes.length >= 3 ? "major" : "minor"),
  }
}
