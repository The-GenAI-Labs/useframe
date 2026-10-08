import {
  BRIEF_OPTION_LABELS,
  FIELD_DEFS,
  QUICK_STEP_IDS,
  REQUIRED_FIELD_IDS,
  STEP_IDS,
  fieldsForStep,
  isBlankValue,
  type BriefData,
  type BriefFieldErrors,
  type FieldId,
  type StepId,
} from "@repo/schemas"
import { BUILDER_CAPABILITIES } from "@repo/site-builder"

export type BriefViewMode = "QUICK" | "FULL"

// sourceDocument is only ever used to pre-fill, so it lives in the
// "Start faster" panel rather than the brand step.
const PANEL_ONLY: FieldId[] = ["sourceDocument"]

export function isFieldVisible(id: FieldId, data: BriefData): boolean {
  if (PANEL_ONLY.includes(id)) return false
  if (id === "language") return BUILDER_CAPABILITIES.languages.length > 1
  if (id === "launchDate") return data.availability === "LAUNCHING_SOON"
  return true
}

export function stepsFor(view: BriefViewMode): StepId[] {
  return view === "QUICK" ? [...QUICK_STEP_IDS] : [...STEP_IDS]
}

export function fieldsFor(step: StepId, view: BriefViewMode, data: BriefData): FieldId[] {
  return fieldsForStep(step).filter(
    (id) => isFieldVisible(id, data) && (view === "FULL" || REQUIRED_FIELD_IDS.includes(id)),
  )
}

export function stepHasRequired(step: StepId): boolean {
  return fieldsForStep(step).some((id) => REQUIRED_FIELD_IDS.includes(id))
}

export function fieldOfErrorKey(key: string): FieldId {
  return key.split(".")[0] as FieldId
}

export function errorsForField(errors: BriefFieldErrors, id: FieldId): string[] {
  return Object.entries(errors)
    .filter(([k]) => fieldOfErrorKey(k) === id)
    .flatMap(([, msgs]) => msgs)
}

export function firstStepWithError(errors: BriefFieldErrors): StepId | null {
  const fields = new Set(Object.keys(errors).map(fieldOfErrorKey))
  return STEP_IDS.find((s) => fieldsForStep(s).some((f) => fields.has(f))) ?? null
}

export function firstUnfilledStep(data: BriefData, after: StepId | null): StepId {
  const start = after ? STEP_IDS.indexOf(after) + 1 : 0
  return STEP_IDS.slice(start).find((s) => fieldsForStep(s).some((f) => isFieldVisible(f, data) && isBlankValue(data[f]))) ?? STEP_IDS[0]
}

function label(group: keyof typeof BRIEF_OPTION_LABELS, value: string): string {
  return (BRIEF_OPTION_LABELS[group] as Record<string, string>)[value] ?? value
}

function clip(text: string, max = 90): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

// Short, plain-text summary of an answer for the brief panel.
export function summarize(id: FieldId, data: BriefData): string {
  const v = data[id] as unknown
  if (isBlankValue(v)) return "—"
  switch (id) {
    case "productType":
      return label("productType", v as string)
    case "availability":
      return label("availability", v as string)
    case "primaryGoal":
      return label("primaryGoal", v as string)
    case "audienceSegment":
      return label("audienceSegment", v as string)
    case "siteType":
      return label("siteType", v as string)
    case "tone":
      return (v as string[]).map((t) => label("tone", t)).join(", ")
    case "trafficSources":
      return (v as string[]).map((t) => label("trafficSource", t)).join(", ")
    case "features":
      return clip((data.features ?? []).map((f) => f.title).join(", "))
    case "howItWorks":
      return clip((data.howItWorks?.steps ?? []).map((s) => s.title).join(" → "))
    case "competitors":
      return clip((data.competitors ?? []).map((c) => c.name).join(", "))
    case "testimonials":
      return `${data.testimonials?.length ?? 0} quote(s)`
    case "metrics":
      return clip((data.metrics ?? []).map((m) => `${m.value} ${m.label}`).join(", "))
    case "certifications":
      return clip((data.certifications ?? []).map((c) => c.name).join(", "))
    case "faq":
      return `${data.faq?.length ?? 0} question(s)`
    case "pricing":
      return data.pricing?.mode === "SHOW_PLANS"
        ? clip((data.pricing.plans ?? []).map((p) => `${p.name} ${p.currency} ${p.price}`).join(", "))
        : label("pricingMode", data.pricing?.mode ?? "HIDE")
    case "ctaPrimary":
    case "ctaSecondary": {
      const cta = data[id]!
      return `${cta.label} → ${cta.type === "URL" ? cta.url ?? "" : label("ctaType", cta.type)}`
    }
    case "buyer":
      return data.buyer?.sameAsUser ? "Same as the user" : clip(data.buyer?.description ?? "")
    case "legal":
      return label("legalMode", data.legal?.mode ?? "GENERATE_TEMPLATE")
    case "logo":
      return "Uploaded"
    case "socialLinks":
      return clip(Object.keys(data.socialLinks ?? {}).map((n) => label("socialNetwork", n)).join(", "))
    case "afterConversion":
      return clip(data.afterConversion?.message ?? "")
    case "audienceDetails":
      return clip(Object.values(data.audienceDetails ?? {}).filter(Boolean).join(", "))
    case "designReferences":
      return clip((data.designReferences ?? []).map((r) => r.url).join(", "))
  }
  if (typeof v === "boolean") return v ? "Yes" : "No"
  if (Array.isArray(v)) return clip(v.map(String).join(", "))
  if (typeof v === "string") return clip(v)
  return clip(JSON.stringify(v))
}

export function fieldLabel(id: FieldId): string {
  return FIELD_DEFS[id].label
}
