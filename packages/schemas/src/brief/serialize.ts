import type { NicheCategory } from "../project.schema.js"
import type { SectionType } from "../siteSpec.js"
import { FIELD_DEFS, FIELD_IDS, type FieldId, type IfBlank, type StepId } from "./catalog.js"
import { BRIEF_OMITTED_COPY, BRIEF_WARNING_COPY } from "./copy.js"
import type { BriefMeta, Source } from "./provenance.js"
import { composeRawIdea } from "./api.js"
import { isBlankValue } from "./rules.js"
import type { BriefData } from "./schema.js"

export type BuilderCapabilities = {
  formHandler: boolean
  legalPages: boolean
  languages: readonly string[]
}

const LLM_EXCLUDED_FIELDS = [
  "contactEmail",
  "phone",
  "companyAddress",
  "socialLinks",
  "logo",
  "sourceDocument",
] as const satisfies readonly FieldId[]

export type LlmSafeBrief = Omit<BriefData, (typeof LLM_EXCLUDED_FIELDS)[number] | "testimonials" | "afterConversion"> & {
  testimonials?: { quote: string; role?: string }[]
  afterConversion?: { message: string; expectedResponseTime?: string }
}

// Contact details, uploads and the names of people/companies quoted in
// testimonials (third-party personal data) never reach a model, trace or log.
export function toLlmSafeView(data: BriefData): LlmSafeBrief {
  const copy: Record<string, unknown> = structuredClone(data)
  for (const f of LLM_EXCLUDED_FIELDS) delete copy[f]
  if (data.testimonials) {
    copy.testimonials = data.testimonials.map((t) => ({
      quote: t.quote,
      ...(t.role ? { role: t.role } : {}),
    }))
  }
  if (data.afterConversion) {
    copy.afterConversion = {
      message: data.afterConversion.message,
      ...(data.afterConversion.expectedResponseTime
        ? { expectedResponseTime: data.afterConversion.expectedResponseTime }
        : {}),
    }
  }
  return copy as LlmSafeBrief
}

export type ContentAvailability = {
  testimonials: boolean
  trustedBy: boolean
  metrics: boolean
  certifications: boolean
  pricingPlans: boolean
  competitorsListed: boolean
  formHandler: boolean
  publicContact: boolean
}

export function contentAvailability(data: BriefData, caps: BuilderCapabilities): ContentAvailability {
  return {
    testimonials: (data.testimonials ?? []).some((t) => t.permissionConfirmed) && data.proofAttested === true,
    trustedBy: !isBlankValue(data.trustedBy) && data.proofAttested === true,
    metrics: !isBlankValue(data.metrics) && data.proofAttested === true,
    certifications: !isBlankValue(data.certifications) && data.proofAttested === true,
    pricingPlans: data.pricing?.mode === "SHOW_PLANS" && (data.pricing.plans?.length ?? 0) > 0,
    competitorsListed: !isBlankValue(data.competitors),
    formHandler: caps.formHandler,
    publicContact:
      (!!data.contactEmail && data.showContactPublicly !== false) || !isBlankValue(data.phone),
  }
}

// Brief facts each generated section type depends on. A section whose
// requirement is unmet is never offered to the planner/structure step and is
// stripped if a model proposes it anyway. TEAM has no brief data yet.
export const SECTION_REQUIRES_BRIEF: Partial<Record<SectionType, (keyof ContentAvailability | "unavailable")[]>> = {
  TESTIMONIALS: ["testimonials"],
  PRICING: ["pricingPlans"],
  CONTACT: ["publicContact"],
  TEAM: ["unavailable"],
}

export function isSectionAllowed(type: string, availability: ContentAvailability): boolean {
  const reqs = SECTION_REQUIRES_BRIEF[type as SectionType]
  if (!reqs) return true
  return reqs.every((r) => r !== "unavailable" && availability[r])
}

export function excludedSectionTypes(availability: ContentAvailability): SectionType[] {
  return (Object.keys(SECTION_REQUIRES_BRIEF) as SectionType[]).filter((t) => !isSectionAllowed(t, availability))
}

export type GenerationBrief = {
  facts: LlmSafeBrief
  sources: Partial<Record<FieldId, Source>>
}

export type PipelineInput = {
  rawIdea: string
  niche?: NicheCategory
  intakeAnswers: Record<string, string>
  brief: GenerationBrief
  contentAvailability: ContentAvailability
  userCompetitors: { name: string; url?: string }[]
  styleReferences: { url: string; note?: string }[]
  existingUrl?: string
}

export const INTAKE_ANSWER_KEYS = [
  "audience",
  "segment",
  "goal",
  "tone",
  "availability",
  "productType",
  "techLevel",
  "pricingMode",
  "siteType",
] as const

// The only way the research/generation pipeline reads a brief.
export function toPipelineInput(
  brief: { data: BriefData; meta: BriefMeta },
  caps: BuilderCapabilities,
): PipelineInput {
  const d = brief.data
  const rawIdea = composeRawIdea(d)

  const answers: Record<(typeof INTAKE_ANSWER_KEYS)[number], string | undefined> = {
    audience: d.audienceDescription,
    segment: d.audienceSegment,
    goal: d.primaryGoal,
    tone: d.tone?.join(", ") || undefined,
    availability: d.availability,
    productType: d.productType,
    techLevel: d.audienceDetails?.techLevel,
    pricingMode: d.pricing?.mode,
    siteType: d.siteType,
  }
  const intakeAnswers = Object.fromEntries(
    Object.entries(answers).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""),
  )

  const sources: Partial<Record<FieldId, Source>> = {}
  for (const id of FIELD_IDS) {
    const m = brief.meta[id]
    if (m && !isBlankValue(d[id])) sources[id] = m.source
  }

  return {
    rawIdea,
    ...(d.niche && brief.meta.niche?.source === "user" ? { niche: d.niche } : {}),
    intakeAnswers,
    brief: { facts: toLlmSafeView(d), sources },
    contentAvailability: contentAvailability(d, caps),
    userCompetitors: (d.competitors ?? []).map((c) => ({ name: c.name, ...(c.url ? { url: c.url } : {}) })),
    styleReferences: (d.designReferences ?? []).map((r) => ({ url: r.url, ...(r.note ? { note: r.note } : {}) })),
    ...(d.existingUrl ? { existingUrl: d.existingUrl } : {}),
  }
}

export type OmittedSection = { field: FieldId; step: StepId; label: string }

const OMIT_DISPLAY: (keyof typeof BRIEF_OMITTED_COPY & FieldId)[] = [
  "testimonials",
  "trustedBy",
  "metrics",
  "certifications",
  "logo",
  "socialLinks",
  "phone",
  "companyAddress",
  "ctaSecondary",
  "campaignMessage",
]

export function omittedSections(data: BriefData, droppedAssumed: FieldId[] = []): OmittedSection[] {
  const out: OmittedSection[] = []
  if (!(data.pricing?.mode === "SHOW_PLANS" && (data.pricing.plans?.length ?? 0) > 0) && data.pricing?.mode !== "CONTACT_SALES" && data.pricing?.mode !== "FREE") {
    out.push({ field: "pricing", step: "product", label: BRIEF_OMITTED_COPY.pricing })
  }
  for (const f of OMIT_DISPLAY) {
    if (isBlankValue(data[f])) out.push({ field: f, step: FIELD_DEFS[f].step, label: BRIEF_OMITTED_COPY[f] })
  }
  for (const f of droppedAssumed) {
    if (isBlankValue(data[f])) {
      out.push({ field: f, step: FIELD_DEFS[f].step, label: `${FIELD_DEFS[f].label} ${BRIEF_OMITTED_COPY.assumedDropped}` })
    }
  }
  return out
}

export type BriefWarning = { code: keyof typeof BRIEF_WARNING_COPY; message: string; step: StepId }

export function computeWarnings(data: BriefData, caps: BuilderCapabilities): BriefWarning[] {
  const out: BriefWarning[] = []
  const add = (code: BriefWarning["code"], step: StepId) => out.push({ code, message: BRIEF_WARNING_COPY[code], step })

  if (
    data.availability === "LAUNCHING_SOON" &&
    (data.primaryGoal === "SALES" || data.primaryGoal === "FREE_TRIAL" || data.primaryGoal === "APP_DOWNLOADS")
  ) {
    add("launchingSoonGoal", "goal")
  }
  if (data.primaryGoal === "APP_DOWNLOADS" && data.ctaPrimary?.type !== "URL") add("appDownloadsNeedsLink", "cta")
  if (data.pricing?.mode === "SHOW_PLANS" && !(data.pricing.plans?.length)) add("plansMissing", "product")
  if ((data.legal?.mode ?? "GENERATE_TEMPLATE") === "GENERATE_TEMPLATE" && !caps.legalPages) add("legalNotGenerated", "presence")
  if ((data.ctaPrimary?.type === "FORM" || data.ctaSecondary?.type === "FORM") && !caps.formHandler) add("formNotAvailable", "cta")
  return out
}

export function blankRule(id: FieldId): IfBlank {
  return FIELD_DEFS[id].ifBlank as IfBlank
}
