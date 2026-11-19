import type { LanguageModelV1 } from "ai"
import { z } from "zod"
import {
  checkSectionContent,
  checkSpecQuality,
  isVariantOf,
  repeatsLayout,
  SiteThemeSchema,
  WRITTEN_SECTION_TYPES,
  type GenerateRequest,
  type Section,
  type SiteSpec,
  type SpecQualityOptions,
} from "@repo/schemas"
import { contrastPairs, contrastRatio, resolveTheme } from "@repo/site-builder"
import { DEFAULT_CRITIQUE_PROMPT, type CritiquePromptVars } from "@/prompts/critique.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"
import { generateValidated } from "@/llm/structured.js"
import type { ProjectBriefContext } from "@/lib/briefPipeline.js"
import { copyFacts } from "@/lib/copyQuality.js"
import { orderByArc, type Archetype } from "@/lib/narrative.js"
import { archetypeFor } from "./structure.agent.js"

const score = z.number().int().min(1).max(10)
export const CritiqueScoresSchema = z.object({
  clarity: score,
  specificity: score,
  hierarchy: score,
  repetition: score,
  ctaConsistency: score,
  proofHonesty: score,
  lengthLimits: score,
  accessibility: score,
  visualRhythm: score,
})
export type CritiqueScores = z.infer<typeof CritiqueScoresSchema>

const target = { pageSlug: z.string(), sectionIndex: z.number().int() }
export const CritiquePatchSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("content"), ...target, field: z.string(), value: z.string() }),
  z.object({ op: z.literal("variant"), ...target, variant: z.string() }),
  z.object({ op: z.literal("move"), ...target, toPosition: z.number().int() }),
  z.object({ op: z.literal("theme"), token: z.string(), value: z.string() }),
])
export type CritiquePatch = z.infer<typeof CritiquePatchSchema>

export const CritiqueSchema = z.object({ scores: CritiqueScoresSchema, patches: z.array(CritiquePatchSchema).max(12) })

const CONTENT_FIELD = /^(eyebrow|headline|subheadline|body|cta\.primary|cta\.secondary|items\.(\d+)\.(title|description))$/
const SCORED_CODES = new Set(["missing", "limit", "placeholder", "banned", "invented_proof", "items", "restated"])

type Content = NonNullable<Section["content"]>

function setField(content: Content, field: string, value: string): Content | null {
  const m = CONTENT_FIELD.exec(field)
  if (!m) return null
  if (field.startsWith("cta.")) return { ...content, cta: { ...content.cta, [field.slice(4)]: value } }
  if (m[2] !== undefined) {
    const i = Number(m[2])
    const items = [...(content.items ?? [])]
    if (!items[i]) return null
    items[i] = { ...items[i]!, [m[3]!]: value }
    return { ...content, items }
  }
  return { ...content, [field]: value }
}

const issueCount = (section: Section, facts: string) =>
  checkSectionContent(section.type, section.variant, section.content, facts).filter((i) => SCORED_CODES.has(i.code)).length

// Applies each patch only if it is valid and does not make the section worse.
export function applyCritiquePatches(
  spec: Partial<SiteSpec>,
  patches: CritiquePatch[],
  facts: string,
  // When code chose the order from a narrative arc, moves may not break it.
  archetype?: Archetype,
): { spec: Partial<SiteSpec>; applied: number; rejected: string[] } {
  const pages = structuredClone(spec.pages ?? [])
  let theme = spec.theme ? { ...spec.theme } : undefined
  let applied = 0
  const rejected: string[] = []
  const reject = (p: CritiquePatch, why: string) => rejected.push(`${p.op}: ${why}`)

  for (const patch of patches) {
    if (patch.op === "theme") {
      const field = (SiteThemeSchema.shape as Record<string, z.ZodTypeAny>)[patch.token]
      if (!field || !field.safeParse(patch.value).success) {
        reject(patch, `invalid ${patch.token}`)
        continue
      }
      theme = { ...theme, [patch.token]: patch.value }
      applied++
      continue
    }
    const page = pages.find((p) => p.slug === patch.pageSlug)
    const pos = page?.sections.findIndex((s) => s.index === patch.sectionIndex) ?? -1
    if (!page || pos < 0) {
      reject(patch, "unknown section")
      continue
    }
    const section = page.sections[pos]!
    if (patch.op === "content") {
      if (!WRITTEN_SECTION_TYPES.includes(section.type)) {
        reject(patch, `${section.type} content is not editable`)
        continue
      }
      const content = setField(section.content ?? {}, patch.field, patch.value.trim())
      const next = content ? { ...section, content } : null
      if (!next || issueCount(next, facts) > issueCount(section, facts) || checkSectionContent(next.type, next.variant, next.content, facts).some((i) => i.path.startsWith(patch.field) && SCORED_CODES.has(i.code))) {
        reject(patch, `${patch.field} fails the copy rules`)
        continue
      }
      page.sections[pos] = next
      if (patch.field === "cta.primary" && section.type === "HERO") {
        page.sections = page.sections.map((s) => (s.type === "CTA" && s.content?.cta ? { ...s, content: { ...s.content, cta: { ...s.content.cta, primary: patch.value.trim() } } } : s))
      }
    } else if (patch.op === "variant") {
      const next = { ...section, variant: patch.variant as Section["variant"] }
      if (!isVariantOf(section.type, patch.variant) || repeatsLayout(page.sections[pos - 1], next) || repeatsLayout(next, page.sections[pos + 1])) {
        reject(patch, `variant ${patch.variant} not allowed here`)
        continue
      }
      page.sections[pos] = next
    } else {
      const first = page.sections.findIndex((s) => s.type === "HERO")
      const last = page.sections.findIndex((s) => s.type === "FOOTER")
      const lo = first + 1
      const hi = (last < 0 ? page.sections.length : last) - 1
      if (["HERO", "FOOTER", "HEADER"].includes(section.type) || patch.toPosition < lo || patch.toPosition > hi) {
        reject(patch, "move outside the body of the page")
        continue
      }
      const reordered = [...page.sections]
      reordered.splice(pos, 1)
      reordered.splice(patch.toPosition, 0, section)
      if (reordered.some((s, i) => repeatsLayout(reordered[i - 1], s))) {
        reject(patch, "move would repeat a layout")
        continue
      }
      const body = reordered.filter((s) => s.type !== "FOOTER" && s.type !== "HEADER")
      if (archetype && orderByArc(body, archetype).some((s, i) => s !== body[i])) {
        reject(patch, "move would break the narrative arc")
        continue
      }
      page.sections = reordered
    }
    applied++
  }
  return { spec: { ...spec, pages, ...(theme ? { theme } : {}) }, applied, rejected }
}

export function critiqueMeasurements(spec: Partial<SiteSpec>, opts: SpecQualityOptions): string {
  const lines: string[] = []
  if (spec.designSystem) {
    const theme = resolveTheme(spec as SiteSpec)
    const pairs = contrastPairs(theme.palette).map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
    const worst = pairs.reduce((a, b) => (b.ratio < a.ratio ? b : a))
    lines.push(`preset ${theme.preset}, colorMode ${theme.colorMode}, body ${theme.bodyPx}px, touch target ${theme.touchPx}px`)
    lines.push(`lowest text contrast ${worst.ratio.toFixed(2)}:1 (${worst.name}); every pair is auto-corrected to at least 4.5:1`)
  }
  const issues = spec.pages ? checkSpecQuality({ pages: spec.pages }, opts) : []
  lines.push(issues.length ? `validator findings:\n${issues.slice(0, 30).map((i) => `- ${i.code} at ${i.path}: ${i.detail}`).join("\n")}` : "validator findings: none")
  return lines.join("\n")
}

export function proofAvailability(briefCtx: ProjectBriefContext | null): SpecQualityOptions["proof"] {
  const a = briefCtx?.input.contentAvailability
  return a ? { testimonials: a.testimonials, metrics: a.metrics, trustedBy: a.trustedBy, pricingPlans: a.pricingPlans } : {}
}

export async function runCritiqueAgent(
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
  promptFn: (vars: CritiquePromptVars) => string = DEFAULT_CRITIQUE_PROMPT,
  briefCtx: ProjectBriefContext | null = null,
): Promise<Partial<SiteSpec>> {
  if (!spec.pages) return spec
  const facts = copyFacts(request, briefCtx)
  const specSummary = JSON.stringify({
    theme: spec.theme,
    pages: spec.pages.map((p) => ({
      slug: p.slug,
      sections: p.sections.map((s) => ({ index: s.index, type: s.type, variant: s.variant, purpose: s.purpose, content: s.content })),
    })),
  })
  const { object } = await generateValidated({
    model,
    schema: CritiqueSchema,
    prompt: promptFn({
      specSummary,
      measurements: critiqueMeasurements(spec, { facts, proof: proofAvailability(briefCtx) }),
      startupIdea: request.startupIdea,
      niche: request.niche,
      targetAudience: request.targetAudience,
    }),
    providerOptions,
    maxTokens: 4000,
    functionId: "critique-agent",
  })
  if (!object) {
    console.warn("[critique] no valid review; spec left unchanged")
    return spec
  }
  const result = applyCritiquePatches(spec, object.patches, facts, spec.designBrief ? undefined : archetypeFor(request, briefCtx))
  console.log(`[critique] scores ${JSON.stringify(object.scores)} patches ${result.applied}/${object.patches.length} applied`)
  return result.spec
}
