import { BRIEF_FIELD_COPY } from "./copy.js"

// Bump when a field is added, removed or its value shape changes, so stored
// drafts can be told apart from the catalog they were written against.
export const BRIEF_CATALOG_VERSION = 1

export const STEP_IDS = [
  "about",
  "goal",
  "product",
  "cta",
  "brand",
  "proof",
  "presence",
  "visitors",
] as const
export type StepId = (typeof STEP_IDS)[number]

export const PRODUCT_TYPES = [
  "SOFTWARE_SAAS",
  "MOBILE_APP",
  "SERVICE",
  "PHYSICAL_PRODUCT",
  "MARKETPLACE",
  "EDUCATION_CONTENT",
  "OTHER",
] as const
export const AVAILABILITY = ["LIVE", "BETA", "LAUNCHING_SOON"] as const
export const PRIMARY_GOALS = [
  "SALES",
  "DEMO_BOOKINGS",
  "FREE_TRIAL",
  "APP_DOWNLOADS",
  "INQUIRIES",
  "EMAIL_SIGNUPS",
  "WAITLIST",
] as const
export const AUDIENCE_SEGMENTS = ["B2B", "B2C", "BOTH"] as const
export const TECH_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const
export const BRIEF_SITE_TYPES = ["SINGLE_PAGE", "MULTI_PAGE", "AI_DECIDES"] as const
export const PRICING_MODES = ["SHOW_PLANS", "CONTACT_SALES", "FREE", "HIDE"] as const
export const PRICE_INTERVALS = ["MONTHLY", "YEARLY", "ONE_TIME", "CUSTOM"] as const
export const CTA_TYPES = ["URL", "EMAIL", "FORM"] as const
export const TONES = [
  "PROFESSIONAL",
  "FRIENDLY",
  "TECHNICAL",
  "PREMIUM",
  "PLAYFUL",
  "BOLD",
  "CALM",
] as const
export const LEGAL_MODES = ["LINK_OWN", "GENERATE_TEMPLATE", "NONE"] as const
export const TRAFFIC_SOURCES = [
  "GOOGLE_SEARCH",
  "ADS",
  "LINKEDIN",
  "EMAIL",
  "SOCIAL",
  "DIRECT_REFERRAL",
  "OTHER",
] as const
export const SOCIAL_NETWORKS = [
  "linkedin",
  "x",
  "instagram",
  "facebook",
  "youtube",
  "github",
  "other",
] as const
export const BRIEF_LANGUAGES = ["en"] as const

export type FieldTier = "required" | "recommended" | "optional"
export type IfBlank =
  | { kind: "required" }
  | { kind: "default"; value: unknown }
  | { kind: "assume" }
  | { kind: "research" }
  | { kind: "pipeline" }
  | { kind: "omit" }
  | { kind: "conditional" }

export type FieldKind =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "url"
  | "email"
  | "date"
  | "list"
  | "object"
  | "bool"
  | "upload"

type FieldSpec = {
  step: StepId
  tier: FieldTier
  kind: FieldKind
  limits: Record<string, unknown>
  ifBlank: IfBlank
  claimSensitive?: boolean
  proof?: boolean
  aiDecideAllowed?: boolean
}

const len = (min: number, max: number) => ({ min, max })

const SPECS = {
  productName: { step: "about", tier: "required", kind: "text", limits: len(1, 80), ifBlank: { kind: "required" } },
  companyName: { step: "about", tier: "recommended", kind: "text", limits: len(0, 80), ifBlank: { kind: "default", value: { fromField: "productName" } } },
  oneLiner: { step: "about", tier: "required", kind: "textarea", limits: len(20, 300), ifBlank: { kind: "required" } },
  productType: { step: "about", tier: "required", kind: "select", limits: { options: PRODUCT_TYPES }, ifBlank: { kind: "required" } },
  availability: { step: "about", tier: "required", kind: "select", limits: { options: AVAILABILITY }, ifBlank: { kind: "required" } },
  launchDate: { step: "about", tier: "optional", kind: "date", limits: { future: true, showWhen: { availability: "LAUNCHING_SOON" } }, ifBlank: { kind: "omit" } },
  existingUrl: { step: "about", tier: "optional", kind: "url", limits: len(0, 500), ifBlank: { kind: "omit" } },
  niche: { step: "about", tier: "optional", kind: "select", limits: { options: "NicheCategory" }, ifBlank: { kind: "pipeline" } },

  primaryGoal: { step: "goal", tier: "required", kind: "select", limits: { options: PRIMARY_GOALS }, ifBlank: { kind: "required" } },
  audienceDescription: { step: "goal", tier: "required", kind: "textarea", limits: len(10, 300), ifBlank: { kind: "required" } },
  audienceSegment: { step: "goal", tier: "recommended", kind: "select", limits: { options: AUDIENCE_SEGMENTS }, ifBlank: { kind: "assume" }, aiDecideAllowed: true },
  audienceDetails: { step: "goal", tier: "optional", kind: "object", limits: { industry: 100, companySize: 60, region: 100, techLevel: TECH_LEVELS }, ifBlank: { kind: "assume" } },
  buyer: { step: "goal", tier: "recommended", kind: "object", limits: { description: 200 }, ifBlank: { kind: "default", value: { sameAsUser: true } } },
  problem: { step: "goal", tier: "required", kind: "textarea", limits: len(20, 600), ifBlank: { kind: "required" } },
  valueProp: { step: "goal", tier: "recommended", kind: "text", limits: len(10, 200), ifBlank: { kind: "assume" }, claimSensitive: true, aiDecideAllowed: true },
  siteType: { step: "goal", tier: "recommended", kind: "select", limits: { options: BRIEF_SITE_TYPES }, ifBlank: { kind: "default", value: "AI_DECIDES" } },
  language: { step: "goal", tier: "optional", kind: "select", limits: { options: BRIEF_LANGUAGES }, ifBlank: { kind: "default", value: "en" } },

  features: { step: "product", tier: "required", kind: "list", limits: { minItems: 2, maxItems: 5, title: len(1, 60), benefit: len(10, 200) }, ifBlank: { kind: "required" } },
  howItWorks: { step: "product", tier: "recommended", kind: "object", limits: { minItems: 2, maxItems: 5, title: len(1, 60), description: len(0, 200), onboardingNote: 200 }, ifBlank: { kind: "assume" }, aiDecideAllowed: true },
  differentiators: { step: "product", tier: "recommended", kind: "list", limits: { maxItems: 5, item: len(1, 200) }, ifBlank: { kind: "assume" }, claimSensitive: true, aiDecideAllowed: true },
  competitors: { step: "product", tier: "recommended", kind: "list", limits: { maxItems: 5, name: len(1, 80) }, ifBlank: { kind: "research" } },
  currentAlternative: { step: "product", tier: "optional", kind: "text", limits: len(0, 200), ifBlank: { kind: "assume" } },
  allowCompetitorComparison: { step: "product", tier: "optional", kind: "bool", limits: {}, ifBlank: { kind: "default", value: false } },
  pricing: { step: "product", tier: "recommended", kind: "object", limits: { maxPlans: 4, planName: len(1, 40), planFeatures: 8, planFeature: len(1, 100), trialNote: 150, notes: 200 }, ifBlank: { kind: "default", value: { mode: "HIDE" } } },

  ctaPrimary: { step: "cta", tier: "required", kind: "object", limits: { label: len(2, 30), url: 500 }, ifBlank: { kind: "required" } },
  ctaSecondary: { step: "cta", tier: "optional", kind: "object", limits: { label: len(2, 30), url: 500 }, ifBlank: { kind: "omit" } },
  contactEmail: { step: "cta", tier: "required", kind: "email", limits: len(3, 254), ifBlank: { kind: "required" } },
  showContactPublicly: { step: "cta", tier: "optional", kind: "bool", limits: {}, ifBlank: { kind: "default", value: true } },
  afterConversion: { step: "cta", tier: "optional", kind: "object", limits: { message: 300, expectedResponseTime: 100 }, ifBlank: { kind: "default", value: { message: "Thanks! We'll be in touch soon." } } },

  logo: { step: "brand", tier: "optional", kind: "upload", limits: { mimes: ["image/png", "image/jpeg", "image/webp"], maxBytesEnv: "BRIEF_LOGO_MAX_BYTES" }, ifBlank: { kind: "omit" } },
  brandColors: { step: "brand", tier: "optional", kind: "list", limits: { maxItems: 5 }, ifBlank: { kind: "pipeline" } },
  fontPreference: { step: "brand", tier: "optional", kind: "text", limits: len(0, 100), ifBlank: { kind: "pipeline" } },
  tone: { step: "brand", tier: "recommended", kind: "multiselect", limits: { options: TONES, maxItems: 2 }, ifBlank: { kind: "pipeline" } },
  designReferences: { step: "brand", tier: "optional", kind: "list", limits: { maxItems: 3, note: 150, url: 500 }, ifBlank: { kind: "pipeline" } },
  visualNotes: { step: "brand", tier: "optional", kind: "textarea", limits: len(0, 300), ifBlank: { kind: "pipeline" } },
  sourceDocument: { step: "brand", tier: "optional", kind: "upload", limits: { mimes: ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/markdown"], maxBytesEnv: "BRIEF_DOC_MAX_BYTES" }, ifBlank: { kind: "omit" } },

  testimonials: { step: "proof", tier: "optional", kind: "list", limits: { maxItems: 6, quote: len(10, 400), personName: len(1, 80), role: 80, company: 80 }, ifBlank: { kind: "omit" }, proof: true },
  trustedBy: { step: "proof", tier: "optional", kind: "list", limits: { maxItems: 10, item: len(1, 80) }, ifBlank: { kind: "omit" }, proof: true },
  metrics: { step: "proof", tier: "optional", kind: "list", limits: { maxItems: 6, value: len(1, 30), label: len(1, 80), sourceNote: len(1, 120) }, ifBlank: { kind: "omit" }, proof: true },
  certifications: { step: "proof", tier: "optional", kind: "list", limits: { maxItems: 8, name: len(1, 80) }, ifBlank: { kind: "omit" }, proof: true },
  proofAttested: { step: "proof", tier: "optional", kind: "bool", limits: {}, ifBlank: { kind: "conditional" }, proof: true },
  faq: { step: "proof", tier: "optional", kind: "list", limits: { maxItems: 10, q: len(1, 150), a: len(1, 500) }, ifBlank: { kind: "assume" } },
  objections: { step: "proof", tier: "optional", kind: "textarea", limits: len(0, 500), ifBlank: { kind: "assume" } },

  socialLinks: { step: "presence", tier: "optional", kind: "object", limits: { url: 500 }, ifBlank: { kind: "omit" } },
  phone: { step: "presence", tier: "optional", kind: "text", limits: len(0, 30), ifBlank: { kind: "omit" } },
  companyAddress: { step: "presence", tier: "optional", kind: "text", limits: len(0, 200), ifBlank: { kind: "omit" } },
  legal: { step: "presence", tier: "optional", kind: "object", limits: { legalEntityName: 120, country: 60, url: 500 }, ifBlank: { kind: "default", value: { mode: "GENERATE_TEMPLATE" } } },

  trafficSources: { step: "visitors", tier: "optional", kind: "multiselect", limits: { options: TRAFFIC_SOURCES }, ifBlank: { kind: "assume" } },
  targetKeywords: { step: "visitors", tier: "optional", kind: "list", limits: { maxItems: 10, item: len(1, 60) }, ifBlank: { kind: "research" } },
  campaignMessage: { step: "visitors", tier: "optional", kind: "text", limits: len(0, 200), ifBlank: { kind: "omit" } },
} as const satisfies Record<string, FieldSpec>

export type FieldId = keyof typeof SPECS

export type FieldDef = FieldSpec & {
  id: FieldId
  label: string
  help: string
  example?: string
}

type Specs = typeof SPECS
export type FieldDefs = { [K in FieldId]: Specs[K] & { id: K; label: string; help: string; example?: string } }

export const FIELD_DEFS = Object.fromEntries(
  (Object.keys(SPECS) as FieldId[]).map((id) => {
    const copy = BRIEF_FIELD_COPY[id] as { label: string; help: string; example?: string }
    return [id, { ...SPECS[id], id, label: copy.label, help: copy.help, example: copy.example }]
  }),
) as FieldDefs

export const FIELD_IDS = Object.keys(SPECS) as FieldId[]

export function fieldDef(id: FieldId): FieldDef {
  return FIELD_DEFS[id] as FieldDef
}

export function fieldsForStep(step: StepId): FieldId[] {
  return FIELD_IDS.filter((id) => FIELD_DEFS[id].step === step)
}

export const REQUIRED_FIELD_IDS = FIELD_IDS.filter((id) => FIELD_DEFS[id].tier === "required")

export const QUICK_STEP_IDS = STEP_IDS.filter((step) =>
  REQUIRED_FIELD_IDS.some((id) => FIELD_DEFS[id].step === step),
)

export function defaultValueFor(id: FieldId, data: Record<string, unknown>): unknown {
  const rule = FIELD_DEFS[id].ifBlank as IfBlank
  if (rule.kind !== "default") return undefined
  const value = rule.value as unknown
  if (value && typeof value === "object" && "fromField" in value) {
    return data[(value as { fromField: string }).fromField]
  }
  return structuredClone(value)
}

export function isFieldId(value: string): value is FieldId {
  return Object.prototype.hasOwnProperty.call(SPECS, value)
}
