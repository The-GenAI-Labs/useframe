import type { SiteSpec, DesignBrief } from "@repo/schemas"

const HEADLINE_MAX_CHARS: Partial<Record<string, number>> = {
  HERO: 80,
  CTA: 60,
  FOOTER: 40,
}
const BODY_MAX_CHARS: Partial<Record<string, number>> = {
  FEATURES: 200,
  HOW_IT_WORKS: 200,
  TESTIMONIALS: 300,
  FAQ: 300,
}

export type HeadingCheckResult = { valid: boolean; issues: string[] }

/**
 * A page's primary heading (its HERO section's headline) should be the only
 * section claiming H1-equivalent prominence, and a page needs at least one
 * headline somewhere to not read as empty.
 */
export function checkHeadings(spec: Partial<SiteSpec>, pageSlug: string): HeadingCheckResult {
  const page = spec.pages?.find((p) => p.slug === pageSlug)
  if (!page) return { valid: false, issues: [`Page "${pageSlug}" not found`] }

  const issues: string[] = []
  const heroSections = page.sections.filter((s) => s.type === "HERO")
  const headlineCount = page.sections.filter((s) => !!s.content?.headline).length

  if (heroSections.length > 1) {
    issues.push(`Page "${pageSlug}" has ${heroSections.length} HERO sections — only one should claim primary heading prominence`)
  }
  if (headlineCount === 0) {
    issues.push(`Page "${pageSlug}" has no headline content anywhere`)
  }

  return { valid: issues.length === 0, issues }
}

export type CopyLengthResult = { withinRange: boolean; issues: string[] }

export function measureCopy(spec: Partial<SiteSpec>, pageSlug: string, sectionIndex: number): CopyLengthResult {
  const page = spec.pages?.find((p) => p.slug === pageSlug)
  const section = page?.sections.find((s) => s.index === sectionIndex)
  if (!section) return { withinRange: false, issues: [`Section ${sectionIndex} on "${pageSlug}" not found`] }

  const issues: string[] = []
  const headline = section.content?.headline
  const body = section.content?.body

  const headlineMax = HEADLINE_MAX_CHARS[section.type]
  if (headline && headlineMax && headline.length > headlineMax) {
    issues.push(`${section.type} headline is ${headline.length} chars, longer than the ${headlineMax}-char guideline`)
  }

  const bodyMax = BODY_MAX_CHARS[section.type]
  if (body && bodyMax && body.length > bodyMax) {
    issues.push(`${section.type} body is ${body.length} chars, longer than the ${bodyMax}-char guideline`)
  }

  return { withinRange: issues.length === 0, issues }
}

export type BriefComplianceResult = { compliant: boolean; violations: string[] }

/**
 * Exact-match check of the generated spec against the approved DesignBrief's
 * concrete decisions — reused as-is by packages/evals' Tier 1 briefCompliance
 * scorer (duplicated there rather than imported, since evals can't depend on
 * apps/orchestrator-service).
 */
export function diffSpecAgainstBrief(spec: Partial<SiteSpec>, brief: DesignBrief | null | undefined): BriefComplianceResult {
  if (!brief) return { compliant: true, violations: [] }

  const violations: string[] = []
  const ds = spec.designSystem

  if (ds && ds.primaryColor !== brief.colors.primary) {
    violations.push(`primaryColor drift: spec has "${ds.primaryColor}", brief specified "${brief.colors.primary}"`)
  }
  if (ds && ds.fontPrimary !== brief.typography.primary) {
    violations.push(`fontPrimary drift: spec has "${ds.fontPrimary}", brief specified "${brief.typography.primary}"`)
  }

  const specSections = spec.pages?.[0]?.sections.map((s) => s.type) ?? []
  const briefSections = brief.layout.sections
  if (JSON.stringify(specSections) !== JSON.stringify(briefSections)) {
    violations.push(`layout.sections drift: spec has [${specSections.join(", ")}], brief specified [${briefSections.join(", ")}]`)
  }

  return { compliant: violations.length === 0, violations }
}

export type CtaCheckResult = { valid: boolean; issues: string[] }

export function checkCtas(spec: Partial<SiteSpec>): CtaCheckResult {
  const issues: string[] = []
  const allPrimaryCtas: string[] = []

  for (const page of spec.pages ?? []) {
    const ctaSections = page.sections.filter((s) => !!s.content?.cta?.primary)
    if (ctaSections.length === 0) {
      issues.push(`Page "${page.slug}" has no primary CTA`)
    } else if (ctaSections.length > 1) {
      issues.push(`Page "${page.slug}" has ${ctaSections.length} sections with a primary CTA — should be exactly one`)
    }
    for (const s of ctaSections) {
      if (s.content?.cta?.primary) allPrimaryCtas.push(s.content.cta.primary)
    }
  }

  const isSinglePage = spec.siteType === "SINGLE_PAGE"
  if (isSinglePage) {
    const unique = new Set(allPrimaryCtas)
    if (unique.size > 1) {
      issues.push(`Inconsistent CTA wording across a single-page site: ${[...unique].join(", ")}`)
    }
  }

  return { valid: issues.length === 0, issues }
}
