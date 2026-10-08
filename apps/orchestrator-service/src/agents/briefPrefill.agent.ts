import { generateText, type LanguageModelV1 } from "ai"
import { validateFieldValue, type FieldId } from "@repo/schemas"
import { PREFILL_SYSTEM_PROMPT, prefillPrompt } from "@/prompts/brief.prompt.js"

// Fields a pasted note, web page or document can reasonably state. Contact
// details, uploads, legal/attestation and design preferences are left to
// the user, and so are customer names: a company named anywhere in a page
// is not evidence it is a customer.
export const PREFILL_FIELDS = [
  "productName",
  "companyName",
  "oneLiner",
  "productType",
  "availability",
  "primaryGoal",
  "audienceDescription",
  "audienceSegment",
  "audienceDetails",
  "problem",
  "valueProp",
  "features",
  "howItWorks",
  "differentiators",
  "competitors",
  "currentAlternative",
  "pricing",
  "ctaPrimary",
  "tone",
  "testimonials",
  "metrics",
  "certifications",
  "faq",
  "objections",
  "trafficSources",
  "targetKeywords",
] as const satisfies readonly FieldId[]

export type PrefillResult = {
  values: Partial<Record<FieldId, unknown>>
  confidence: Partial<Record<FieldId, number>>
  excerpts: Partial<Record<FieldId, string>>
}

function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

// Proof only counts when it is literally in the source; anything a model
// "remembers" or was talked into inventing is dropped here.
export function groundProof(field: FieldId, value: unknown, source: string): unknown {
  const src = norm(source)
  const inSource = (s: unknown) => typeof s === "string" && s.trim().length > 0 && src.includes(norm(s))
  if (!Array.isArray(value) && field !== "pricing") return value

  switch (field) {
    case "testimonials":
      return (value as { quote?: unknown; personName?: unknown }[])
        .filter((t) => inSource(t.quote) && inSource(t.personName))
        .map((t) => ({ ...t, permissionConfirmed: false }))
    case "metrics":
      return (value as { value?: unknown; label?: unknown }[]).filter((m) => inSource(m.value) && inSource(m.label))
    case "certifications":
      return (value as { name?: unknown }[]).filter((c) => inSource(c.name))
    case "pricing": {
      const pricing = value as { plans?: { name?: unknown; price?: unknown }[] }
      if (!pricing || typeof pricing !== "object" || !Array.isArray(pricing.plans)) return value
      const plans = pricing.plans.filter((p) => inSource(p.name) && inSource(p.price))
      return plans.length > 0 ? { ...pricing, plans } : { ...pricing, plans: undefined, mode: "HIDE" }
    }
    default:
      return value
  }
}

// The cheap model doesn't reliably honour JSON-object mode, so replies are
// read as text and the outermost JSON object is extracted, like the other
// agents here do.
export function parseJsonObject(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0])
  } catch {
    return null
  }
}

// Models sometimes return a bare value instead of {value, confidence}.
export function readEntry(raw: unknown): { value: unknown; confidence?: unknown; excerpt?: unknown } | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw === "object" && !Array.isArray(raw) && "value" in raw) {
    return raw as { value: unknown; confidence?: unknown; excerpt?: unknown }
  }
  return { value: raw }
}

export function sanitizePrefill(raw: unknown, source: string): PrefillResult {
  const result: PrefillResult = { values: {}, confidence: {}, excerpts: {} }
  const fields = (raw as { fields?: unknown } | null)?.fields
  if (!fields || typeof fields !== "object") return result
  const src = norm(source)

  for (const id of PREFILL_FIELDS) {
    const entry = readEntry((fields as Record<string, unknown>)[id])
    if (!entry || entry.value === undefined || entry.value === null) continue
    const grounded = groundProof(id, entry.value, source)
    if (Array.isArray(grounded) && grounded.length === 0) continue
    const cleaned = stripUndefined(grounded)
    if (!validateFieldValue(id, cleaned, "draft").ok) continue
    result.values[id] = cleaned
    const c = Number(entry.confidence)
    result.confidence[id] = Number.isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.5
    if (typeof entry.excerpt === "string" && entry.excerpt.trim() && src.includes(norm(entry.excerpt))) {
      result.excerpts[id] = entry.excerpt.trim().slice(0, 200)
    }
  }
  return result
}

function stripUndefined(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown
}

export async function runBriefPrefill(sourceText: string, model: LanguageModelV1, abortSignal: AbortSignal): Promise<PrefillResult> {
  const { text } = await generateText({
    model,
    system: PREFILL_SYSTEM_PROMPT,
    prompt: prefillPrompt(sourceText, PREFILL_FIELDS),
    maxTokens: 6000,
    abortSignal,
    // The source can carry third-party personal data, so traces keep only
    // timing and token counts.
    experimental_telemetry: { isEnabled: true, functionId: "brief.prefill", recordInputs: false, recordOutputs: false },
  })
  return sanitizePrefill(parseJsonObject(text), sourceText)
}
