import {
  checkCta,
  checkSectionContent,
  contentContract,
  COPY_LIMITS,
  type GenerateRequest,
  type QualityIssue,
  type Section,
  type SectionType,
} from "@repo/schemas"
import { ICONS } from "@repo/site-builder"
import { briefFactsBlock, type ProjectBriefContext } from "./briefPipeline.js"

type Content = NonNullable<Section["content"]>

// Everything a claim may legitimately come from: brief facts, or the request.
export function copyFacts(request: Pick<GenerateRequest, "startupIdea" | "targetAudience" | "differentiator" | "name">, briefCtx: ProjectBriefContext | null): string {
  return [briefCtx ? briefFactsBlock(briefCtx) : "", request.name, request.startupIdea, request.targetAudience, request.differentiator].filter(Boolean).join("\n")
}

export function contractText(type: SectionType, variant?: string): string {
  const c = contentContract(type, variant)
  const parts = [
    c.eyebrow ? `eyebrow optional (≤${COPY_LIMITS.eyebrow})` : "",
    `headline required (≤${c.headlineMax})`,
    c.subheadline === "required" ? `subheadline required (≤${COPY_LIMITS.subheadline})` : c.subheadline === "optional" ? `subheadline optional (≤${COPY_LIMITS.subheadline})` : "",
    c.body === "optional" ? `body optional (≤${COPY_LIMITS.body * 2})` : "",
    c.cta === "required" ? "cta.primary required (the primary CTA label), cta.secondary optional" : c.cta === "optional" ? "cta optional" : "",
    c.items
      ? type === "FAQ"
        ? `items ${c.items.min}-${c.items.max}: title = real question (≤${c.items.titleMax}), description = direct answer (≤${c.items.descriptionMax})`
        : `items ${c.items.min}-${c.items.max}: title (≤${c.items.titleMax}), description (≤${c.items.descriptionMax}), icon from the menu`
      : "no items",
  ]
  if (type === "CONTACT") parts.push("contact details are added by code; do not write emails or phone numbers")
  return parts.filter(Boolean).join("; ")
}

type PageCopy = { primaryCta: string; sections: (Content & { index: number })[] }

const ISSUE_CODES_FOR_COPY = new Set(["missing", "limit", "placeholder", "banned", "invented_proof", "items"])

export function validatePageCopy(copy: PageCopy, written: Pick<Section, "type" | "index" | "variant">[], facts: string): string[] {
  const issues: QualityIssue[] = []
  checkCta(issues, "primaryCta", copy.primaryCta, true)
  const seenHeadlines = new Map<string, number>()
  const seenOpenings = new Map<string, number>()
  for (const section of written) {
    const content = copy.sections.find((s) => s.index === section.index)
    if (!content) {
      issues.push({ code: "missing", path: `sections[index=${section.index}]`, detail: `${section.type} section is missing` })
      continue
    }
    issues.push(...checkSectionContent(section.type, section.variant, content, facts, `sections[index=${section.index}].`).filter((i) => ISSUE_CODES_FOR_COPY.has(i.code)))
    const h = content.headline?.trim().toLowerCase()
    if (!h) continue
    if (seenHeadlines.has(h)) issues.push({ code: "duplicate", path: `sections[index=${section.index}].headline`, detail: `same headline as index ${seenHeadlines.get(h)}` })
    seenHeadlines.set(h, section.index)
    const opening = h.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).slice(0, 2).join(" ")
    if (opening.includes(" ") && seenOpenings.has(opening)) {
      issues.push({ code: "repeated_opening", path: `sections[index=${section.index}].headline`, detail: `starts like index ${seenOpenings.get(opening)}` })
    }
    seenOpenings.set(opening, section.index)
  }
  return issues.map((i) => `${i.path}: ${i.detail}`)
}

export function clampText(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max + 1)
  const sentence = cut.slice(0, max).match(/^.*[.!?](?=\s|$)/)?.[0]
  if (sentence && sentence.length >= max * 0.6) return sentence.trim()
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).replace(/[\s,;:–—-]+$/, "").trim()
}

const ICON_NAMES = new Set(Object.keys(ICONS))

// Mechanical fixes only: limits and unknown icons. Anything else is left for
// the caller's fallback decision.
export function repairContent(type: SectionType, variant: string | undefined, content: Content): Content {
  const c = contentContract(type, variant)
  const out: Content = { ...content }
  if (out.headline) out.headline = clampText(out.headline, c.headlineMax)
  if (out.subheadline) out.subheadline = clampText(out.subheadline, COPY_LIMITS.subheadline)
  if (out.body) out.body = clampText(out.body, COPY_LIMITS.body * (type === "CUSTOM" ? 2 : 1))
  if (out.eyebrow) out.eyebrow = clampText(out.eyebrow, COPY_LIMITS.eyebrow)
  if (c.items && out.items) {
    out.items = out.items.slice(0, c.items.max).map((item) => ({
      ...item,
      title: clampText(item.title, c.items!.titleMax),
      description: clampText(item.description, c.items!.descriptionMax),
      icon: item.icon && ICON_NAMES.has(item.icon) ? item.icon : undefined,
    }))
  } else if (!c.items) {
    delete out.items
  }
  if (c.cta === "none") delete out.cta
  return out
}

const SEVERE = new Set(["missing", "placeholder", "banned", "invented_proof", "items"])

export function severeIssues(type: SectionType, variant: string | undefined, content: Content, facts: string): QualityIssue[] {
  return checkSectionContent(type, variant, content, facts).filter((i) => SEVERE.has(i.code))
}

export type FallbackSource = {
  product: string
  audience: string
  idea: string
  oneLiner?: string
  valueProp?: string
  features: { title: string; benefit: string }[]
  steps: { title: string; description: string }[]
  faq: { q: string; a: string }[]
  ctaLabel: string
}

export function fallbackSource(request: Pick<GenerateRequest, "name" | "startupIdea" | "targetAudience">, briefCtx: ProjectBriefContext | null): FallbackSource {
  const d = briefCtx?.data
  return {
    product: d?.productName ?? request.name ?? "",
    audience: d?.audienceDescription ?? request.targetAudience,
    idea: request.startupIdea,
    oneLiner: d?.oneLiner,
    valueProp: d?.valueProp,
    features: d?.features ?? [],
    steps: (d?.howItWorks?.steps ?? []).map((s) => ({ title: s.title, description: s.description ?? "" })),
    faq: d?.faq ?? [],
    ctaLabel: d?.ctaPrimary?.label ?? "Get started",
  }
}

const firstSentence = (text: string | undefined) => text?.trim().match(/^[^.!?]+[.!?]?/)?.[0]?.trim()

function pickFitting(candidates: (string | undefined)[], max: number): string | undefined {
  const clean = candidates.map((c) => c?.trim()).filter((c): c is string => !!c)
  return clean.find((c) => c.length <= max) ?? (clean[0] ? clampText(clean[0], max) : undefined)
}

// Brief- or request-based content for a section the model could not write
// acceptably. Returns null when there is nothing honest to say, so the caller
// drops the section rather than showing filler.
export function fallbackContent(type: SectionType, variant: string | undefined, src: FallbackSource): { content: Content; variant?: Section["variant"] } | null {
  const named = (withProduct: string, without: string) => (src.product ? withProduct.replace("{product}", src.product) : without)
  switch (type) {
    case "HERO": {
      const headline = pickFitting([src.valueProp, firstSentence(src.oneLiner), src.product ? `${src.product} for ${src.audience}` : undefined, firstSentence(src.idea)], COPY_LIMITS.h1)
      const subheadline = pickFitting([src.oneLiner, src.idea], COPY_LIMITS.subheadline)
      return headline ? { content: { headline, ...(subheadline && subheadline !== headline ? { subheadline } : {}), cta: { primary: src.ctaLabel } } } : null
    }
    case "FEATURES": {
      if (src.features.length < 2) return null
      return {
        content: {
          headline: clampText(named("What you get with {product}", "What you get"), COPY_LIMITS.headline),
          items: src.features.map((f) => ({ title: clampText(f.title, COPY_LIMITS.itemTitle), description: clampText(f.benefit, COPY_LIMITS.itemDescription) })),
        },
        ...(variant === "bento" && src.features.length < 4 ? { variant: "grid" as const } : {}),
        ...(variant === "alternating" && src.features.length > 4 ? { variant: "grid" as const } : {}),
      }
    }
    case "HOW_IT_WORKS":
      return src.steps.length >= 2
        ? {
            content: {
              headline: clampText(named("How {product} works", "How it works"), COPY_LIMITS.headline),
              items: src.steps.map((s) => ({ title: clampText(s.title, COPY_LIMITS.itemTitle), description: clampText(s.description || s.title, COPY_LIMITS.itemDescription) })),
            },
          }
        : null
    case "FAQ":
      return src.faq.length >= 2
        ? { content: { headline: "Questions, answered", items: src.faq.map((f) => ({ title: clampText(f.q, COPY_LIMITS.faqQuestion), description: clampText(f.a, COPY_LIMITS.faqAnswer) })) } }
        : null
    case "CTA": {
      const subheadline = pickFitting([src.valueProp, firstSentence(src.oneLiner)], COPY_LIMITS.subheadline)
      return { content: { headline: clampText(named("Get started with {product}", "Ready when you are"), COPY_LIMITS.headline), ...(subheadline ? { subheadline } : {}), cta: { primary: src.ctaLabel } } }
    }
    case "CONTACT":
      return { content: { headline: "Get in touch" } }
    default:
      return null
  }
}

export function headerContent(src: FallbackSource): Content {
  return src.product && src.product.length <= 40 ? { headline: src.product } : {}
}
