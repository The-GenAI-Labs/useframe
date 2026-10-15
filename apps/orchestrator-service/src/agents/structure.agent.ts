import { streamText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { Response } from "express"
import { sseWrite } from "@/llm/stream.js"
import type { SiteSpec, SectionType } from "@repo/schemas"
import type { GenerateRequest } from "@repo/schemas"
import {
  DEFAULT_STRUCTURE_PROMPT,
  type StructurePromptVars,
} from "@/prompts/structure.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"
import {
  allowedSectionTypes,
  briefFactsBlock,
  filterSections,
  type ProjectBriefContext,
} from "@/lib/briefPipeline.js"

const VALID_SECTION_TYPES = new Set<string>([
  "HERO", "FEATURES", "HOW_IT_WORKS", "TESTIMONIALS", "PRICING",
  "CTA", "FAQ", "TEAM", "CONTACT", "HEADER", "FOOTER", "CUSTOM",
])

function sectionsFromBrief(
  sectionTypes: string[],
  citations: { layout?: string; colors?: string; typography?: string },
): { type: SectionType; index: number; citationIds: string[] }[] {
  const valid = sectionTypes.filter((t) => VALID_SECTION_TYPES.has(t)) as SectionType[]
  const withFallback = valid.length > 0 ? valid : (["HERO", "FEATURES", "CTA", "FOOTER"] as SectionType[])

  // Every section owes its presence/position to the brief's layout decision;
  // the HERO is additionally the section most shaped by the color and
  // typography decisions, so it carries those citations too. The brief has
  // no per-section granularity beyond this — a defensible mapping given
  // what's actually available, not an invented one.
  return withFallback.map((type, index) => {
    const ids = [citations.layout]
    if (type === "HERO") ids.push(citations.colors, citations.typography)
    return {
      type,
      index,
      citationIds: ids.filter((id): id is string => !!id),
    }
  })
}

type ModelPage = { type: string; slug: string; title: string; sections?: Array<{ type: string; index: number }> }

// The one reading of a structure answer, shared with the Site Blueprint's full mode.
export function structureFromModelOutput(
  parsed: { siteType?: SiteSpec["siteType"]; copyFramework?: SiteSpec["copyFramework"]; pages?: ModelPage[] },
  briefCtx: ProjectBriefContext | null,
  preferredSiteType?: SiteSpec["siteType"],
): Pick<SiteSpec, "siteType" | "copyFramework" | "pages"> {
  return {
    siteType: preferredSiteType ?? parsed.siteType ?? "SINGLE_PAGE",
    copyFramework: parsed.copyFramework ?? "AIDA",
    pages: (parsed.pages ?? []).map((p) => ({
      type: p.type as SiteSpec["pages"][number]["type"],
      slug: p.slug,
      title: p.title,
      sections: filterSections(
        (p.sections ?? []).filter((s) => VALID_SECTION_TYPES.has(s.type)).map((s) => ({ type: s.type as SectionType, index: s.index })),
        briefCtx,
      ).map((s, index) => ({ ...s, index })),
    })),
  }
}

export function structurePromptVars(request: GenerateRequest, briefCtx: ProjectBriefContext | null): StructurePromptVars {
  return {
    startupIdea: request.startupIdea,
    niche: request.niche,
    targetAudience: request.targetAudience,
    inputType: request.inputType,
    ...(briefCtx ? { allowedSections: allowedSectionTypes(briefCtx), briefFacts: briefFactsBlock(briefCtx) } : {}),
  }
}

// Validation for the blueprint's full mode: the same reading, plus no empty pages.
export function parseStructureForBlueprint(raw: unknown, briefCtx: ProjectBriefContext | null):
  | { ok: true; value: Pick<SiteSpec, "siteType" | "copyFramework" | "pages"> }
  | { ok: false; errors: string[] } {
  const value = structureFromModelOutput(raw as Parameters<typeof structureFromModelOutput>[0], briefCtx, structurePreferredSiteType(briefCtx))
  const errors: string[] = []
  if (value.pages.length === 0) errors.push("pages: at least one page is required")
  for (const page of value.pages) if (page.sections.length === 0) errors.push(`pages.${page.slug}: no allowed sections left`)
  return errors.length ? { ok: false, errors } : { ok: true, value }
}

export function structurePreferredSiteType(briefCtx: ProjectBriefContext | null): SiteSpec["siteType"] | undefined {
  return briefCtx?.data.siteType === "SINGLE_PAGE" || briefCtx?.data.siteType === "MULTI_PAGE" ? briefCtx.data.siteType : undefined
}

export async function runStructureAgent(
  res: Response,
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
  promptFn: (vars: StructurePromptVars) => string = DEFAULT_STRUCTURE_PROMPT,
  briefCtx: ProjectBriefContext | null = null,
): Promise<Partial<SiteSpec>> {
  const preferredSiteType = structurePreferredSiteType(briefCtx)

  // When a DesignBrief was approved via the Research step, its layout and
  // copyFramework decisions are already grounded in retrieved research —
  // skip the LLM call for those two fields entirely and execute the brief
  // exactly rather than letting the model re-decide from scratch. Pages
  // still need a title/slug, which the brief doesn't specify.
  if (spec.designBrief) {
    const brief = spec.designBrief
    return {
      ...spec,
      siteType: preferredSiteType ?? (brief.layout.sections.length > 5 ? "MULTI_PAGE" : "SINGLE_PAGE"),
      copyFramework: brief.copyFramework,
      pages: [
        {
          type: "HOME",
          slug: "home",
          title: brief.product || request.name || "Home",
          sections: sectionsFromBrief(filterSections(brief.layout.sections.map((type) => ({ type })), briefCtx).map((s) => s.type), {
            layout: brief.layout.citation,
            colors: brief.colors.citation,
            typography: brief.typography.citation,
          }),
        },
      ],
      citations: brief.citations,
    }
  }

  const prompt = promptFn(structurePromptVars(request, briefCtx))

  const result = streamText({
    model,
    prompt,
    maxTokens: 2000,
    providerOptions,
    experimental_telemetry: { isEnabled: true, functionId: "structure-agent" },
  })

  let fullText = ""
  for await (const chunk of result.textStream) {
    fullText += chunk
    sseWrite(res, { type: "token", delta: chunk })
  }

  try {
    const jsonMatch = fullText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON in structure response")
    const parsed = structureFromModelOutput(JSON.parse(jsonMatch[0]), briefCtx, preferredSiteType)
    return { ...spec, ...parsed, citations: [] }
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
