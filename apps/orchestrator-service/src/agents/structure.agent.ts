import type { LanguageModelV1 } from "ai"
import type { Response } from "express"
import { z } from "zod"
import { sseWrite } from "@/llm/stream.js"
import {
  isVariantOf,
  repeatsLayout,
  SECTION_PURPOSES,
  SECTION_VARIANTS,
  type GenerateRequest,
  type Section,
  type SectionType,
  type SiteSpec,
  type ThemePreset,
} from "@repo/schemas"
import { resolveVariants } from "@repo/site-builder"
import { DEFAULT_STRUCTURE_PROMPT, type StructurePromptVars } from "@/prompts/structure.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"
import { generateValidated } from "@/llm/structured.js"
import { allowedSectionTypes, briefFactsBlock, filterSections, type ProjectBriefContext } from "@/lib/briefPipeline.js"
import { themeFromBrief } from "@/lib/designTheme.js"

const VALID_SECTION_TYPES = new Set<string>(Object.keys(SECTION_VARIANTS))
const PAGE_TYPES = ["HOME", "ABOUT", "CONTACT", "PRICING", "PRODUCT", "RESEARCH", "DEMO"] as const

export const StructurePlanSchema = z.object({
  siteType: z.enum(["SINGLE_PAGE", "MULTI_PAGE"]),
  copyFramework: z.enum(["AIDA", "PAS", "FAB", "PASTOR"]),
  pages: z
    .array(
      z.object({
        type: z.enum(PAGE_TYPES),
        slug: z.string(),
        title: z.string(),
        sections: z.array(z.object({ type: z.string(), variant: z.string().optional(), purpose: z.string().optional() })).min(1),
      }),
    )
    .min(1),
})
type StructurePlan = z.infer<typeof StructurePlanSchema>

type PlannedSection = Pick<Section, "type" | "index" | "variant" | "purpose" | "citationIds">

// Steps a section to another variant of its type when it would repeat its
// neighbour's layout.
export function separateLayouts<T extends Pick<Section, "type" | "variant">>(sections: T[]): T[] {
  const out: T[] = []
  for (const section of sections) {
    const prev = out[out.length - 1]
    if (!repeatsLayout(prev, section)) {
      out.push(section)
      continue
    }
    const options = (SECTION_VARIANTS as Record<string, readonly string[]>)[section.type] ?? []
    const alt = options.find((v) => !repeatsLayout(prev, { type: section.type, variant: v as Section["variant"] }))
    out.push(alt ? { ...section, variant: alt as Section["variant"] } : section)
  }
  return out
}

// Closed menus, honest sections, HERO first and FOOTER last on the home page.
function normalizeSections(raw: { type: string; variant?: string; purpose?: string }[], briefCtx: ProjectBriefContext | null, home: boolean): PlannedSection[] {
  const known = raw.filter((s) => VALID_SECTION_TYPES.has(s.type) && s.type !== "HEADER")
  let sections = filterSections(known, briefCtx).map((s) => ({
    type: s.type as SectionType,
    variant: isVariantOf(s.type as SectionType, s.variant) ? (s.variant as Section["variant"]) : undefined,
    purpose: s.purpose?.trim().slice(0, 160) || SECTION_PURPOSES[s.type as SectionType],
  }))
  const footer = sections.filter((s) => s.type === "FOOTER").slice(-1)
  sections = sections.filter((s) => s.type !== "FOOTER")
  if (home) {
    const hero = sections.findIndex((s) => s.type === "HERO")
    if (hero > 0) sections.unshift(...sections.splice(hero, 1))
    if (hero < 0) sections.unshift({ type: "HERO", variant: undefined, purpose: SECTION_PURPOSES.HERO })
  }
  sections.push(footer[0] ?? { type: "FOOTER", variant: undefined, purpose: SECTION_PURPOSES.FOOTER })
  return separateLayouts(sections).map((s, index) => ({ ...s, index }))
}

type ModelPage = { type: string; slug: string; title: string; sections?: Array<{ type: string; variant?: string; purpose?: string }> }

// The one reading of a structure answer, shared with the Site Blueprint's full mode.
export function structureFromModelOutput(
  parsed: { siteType?: SiteSpec["siteType"]; copyFramework?: SiteSpec["copyFramework"]; pages?: ModelPage[] },
  briefCtx: ProjectBriefContext | null,
  preferredSiteType?: SiteSpec["siteType"],
  homeTitle?: string,
): Pick<SiteSpec, "siteType" | "copyFramework" | "pages"> {
  const pages = (parsed.pages ?? []).filter((p) => (PAGE_TYPES as readonly string[]).includes(p.type))
  return {
    siteType: preferredSiteType ?? parsed.siteType ?? "SINGLE_PAGE",
    copyFramework: parsed.copyFramework ?? "AIDA",
    pages: pages.map((p, i) => {
      const home = p.type === "HOME" || (i === 0 && !pages.some((q) => q.type === "HOME"))
      return {
        type: p.type as SiteSpec["pages"][number]["type"],
        slug: home ? "home" : p.slug.replace(/[^a-z0-9-]/gi, "").toLowerCase() || `page-${i}`,
        title: home && homeTitle ? homeTitle : p.title,
        sections: normalizeSections(p.sections ?? [], briefCtx, home),
      }
    }),
  }
}

// Issues worth one retry; anything else is fixed deterministically.
function planIssues(plan: StructurePlan, briefCtx: ProjectBriefContext | null): string[] {
  const issues: string[] = []
  const allowed = new Set(briefCtx ? allowedSectionTypes(briefCtx) : [...VALID_SECTION_TYPES])
  for (const page of plan.pages) {
    page.sections.forEach((s, i) => {
      if (!VALID_SECTION_TYPES.has(s.type)) issues.push(`pages.${page.slug}.sections.${i}: unknown type "${s.type}"`)
      else if (!allowed.has(s.type) || (!briefCtx && ["TESTIMONIALS", "LOGOS", "STATS", "PRICING", "TEAM"].includes(s.type))) {
        issues.push(`pages.${page.slug}.sections.${i}: ${s.type} is not available (no user-provided facts)`)
      } else if (s.variant && !isVariantOf(s.type as SectionType, s.variant)) {
        issues.push(`pages.${page.slug}.sections.${i}: "${s.variant}" is not a ${s.type} variant`)
      }
      if (i > 0 && repeatsLayout(page.sections[i - 1] as Section, s as Section)) issues.push(`pages.${page.slug}.sections.${i}: same layout as the section before`)
    })
  }
  const home = plan.pages.find((p) => p.type === "HOME") ?? plan.pages[0]
  const body = home?.sections.filter((s) => s.type !== "FOOTER" && s.type !== "HEADER").length ?? 0
  if (plan.siteType === "SINGLE_PAGE" && (body < 5 || body > 9)) issues.push(`home page needs 5-9 sections before the footer, got ${body}`)
  return issues
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
  for (const page of value.pages) if (page.sections.filter((s) => s.type !== "FOOTER").length === 0) errors.push(`pages.${page.slug}: no allowed sections left`)
  return errors.length ? { ok: false, errors } : { ok: true, value }
}

export function structurePreferredSiteType(briefCtx: ProjectBriefContext | null): SiteSpec["siteType"] | undefined {
  return briefCtx?.data.siteType === "SINGLE_PAGE" || briefCtx?.data.siteType === "MULTI_PAGE" ? briefCtx.data.siteType : undefined
}

// Every section owes its presence to the brief's layout decision; the HERO
// also carries the colour and typography citations.
function sectionsFromBrief(types: string[], citations: { layout?: string; colors?: string; typography?: string }, preset: ThemePreset, briefCtx: ProjectBriefContext | null): PlannedSection[] {
  const planned = normalizeSections(types.map((type) => ({ type })), briefCtx, true)
  const variants = resolveVariants(planned as Section[], preset)
  return separateLayouts(planned.map((s, i) => ({ ...s, variant: variants[i] as Section["variant"] }))).map((s) => ({
    ...s,
    citationIds: [citations.layout, ...(s.type === "HERO" ? [citations.colors, citations.typography] : [])].filter((id): id is string => !!id),
  }))
}

const FALLBACK_TYPES = ["HERO", "FEATURES", "HOW_IT_WORKS", "FAQ", "CTA", "FOOTER"]

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

  // An approved DesignBrief already decided layout and framework from
  // research, so the brief is executed exactly; variants and purposes are
  // filled deterministically.
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
          sections: sectionsFromBrief(
            brief.layout.sections,
            { layout: brief.layout.citation, colors: brief.colors.citation, typography: brief.typography.citation },
            themeFromBrief(brief, request.niche).preset ?? "minimal",
            briefCtx,
          ),
        },
      ],
      citations: brief.citations,
    }
  }

  const { object } = await generateValidated({
    model,
    schema: StructurePlanSchema,
    prompt: promptFn(structurePromptVars(request, briefCtx)),
    providerOptions,
    maxTokens: 3000,
    functionId: "structure-agent",
    validate: (plan) => planIssues(plan, briefCtx),
    onDelta: (delta) => sseWrite(res, { type: "token", delta }),
  })

  const parsed = object ? structureFromModelOutput(object, briefCtx, preferredSiteType, request.name) : null
  if (parsed && parsed.pages.length > 0) return { ...spec, ...parsed, citations: [] }

  console.warn("[structure] using the deterministic fallback structure")
  return {
    ...spec,
    siteType: "SINGLE_PAGE",
    copyFramework: "AIDA",
    pages: [
      {
        type: "HOME",
        slug: "home",
        title: request.name ?? "Home",
        sections: normalizeSections(FALLBACK_TYPES.map((type) => ({ type })), briefCtx, true).map((s, i, all) => ({
          ...s,
          variant: resolveVariants(all as Section[], "minimal")[i] as Section["variant"],
        })),
      },
    ],
    citations: [],
  }
}
