import { z } from "zod"
import { NicheCategoryEnum } from "../project.schema.js"
import {
  AUDIENCE_SEGMENTS,
  AVAILABILITY,
  BRIEF_LANGUAGES,
  BRIEF_SITE_TYPES,
  CTA_TYPES,
  FIELD_DEFS,
  LEGAL_MODES,
  PRICE_INTERVALS,
  PRICING_MODES,
  PRIMARY_GOALS,
  PRODUCT_TYPES,
  REQUIRED_FIELD_IDS,
  SOCIAL_NETWORKS,
  TECH_LEVELS,
  TONES,
  TRAFFIC_SOURCES,
  type FieldId,
} from "./catalog.js"
import {
  ATTESTED_PROOF_FIELDS,
  DECIMAL_PRICE,
  HEX_COLOR,
  ISO_4217,
  ISO_DATE,
  PHONE,
  hasControlChars,
  isBlankValue,
  isHttpsUrl,
  isSocialUrl,
} from "./rules.js"

// "draft" accepts partial typing (max lengths, types and safety only) so
// autosave never loses work; "submit" adds minimums and required items.
export type SchemaMode = "draft" | "submit"

type Len = { min: number; max: number }

function text(limits: Len | number, mode: SchemaMode, multiline = false) {
  const { min, max } = typeof limits === "number" ? { min: 0, max: limits } : limits
  let s = z.string().max(max, `Keep it under ${max} characters`)
  if (mode === "submit" && min > 0) s = s.min(min, `Use at least ${min} characters`)
  return s.refine((v) => !hasControlChars(v, multiline), "Contains characters we can't use")
}

// Drafts may hold a half-filled row (empty link) while the user is typing.
function httpsUrl(max = 500, mode: SchemaMode = "submit") {
  return z.string().refine((v) => (mode === "draft" && v === "") || isHttpsUrl(v, max), "Use a full https:// link")
}

function draftOr(mode: SchemaMode, test: (v: string) => boolean, message: string) {
  return z.string().max(40).refine((v) => (mode === "draft" && v === "") || test(v), message)
}

function list<T extends z.ZodTypeAny>(item: T, max: number, min: number, mode: SchemaMode) {
  let a = z.array(item).max(max, `Up to ${max} items`)
  if (mode === "submit" && min > 0) a = a.min(min, `Add at least ${min}`)
  return a
}

const F = FIELD_DEFS

const uploadRef = z
  .object({
    uploadId: z.string().cuid(),
    mime: z.string().max(120),
    name: z.string().max(120).optional(),
    size: z.number().int().nonnegative().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict()

function ctaSchema(mode: SchemaMode) {
  const l = F.ctaPrimary.limits
  return z
    .object({
      label: text(l.label, mode),
      type: z.enum(CTA_TYPES),
      url: z.string().max(l.url).optional(),
    })
    .strict()
    .superRefine((v, ctx) => {
      if (v.url !== undefined && v.url !== "" && !isHttpsUrl(v.url, l.url)) {
        ctx.addIssue({ code: "custom", path: ["url"], message: "Use a full https:// link" })
      }
      if (mode === "submit" && v.type === "URL" && !v.url) {
        ctx.addIssue({ code: "custom", path: ["url"], message: "Add the link this button opens" })
      }
    })
}

export function buildFieldSchemas(mode: SchemaMode) {
  const pricingLimits = F.pricing.limits
  const testimonialLimits = F.testimonials.limits
  const featureLimits = F.features.limits
  const howLimits = F.howItWorks.limits
  const metricLimits = F.metrics.limits

  return {
    productName: text(F.productName.limits, mode),
    companyName: text(F.companyName.limits, mode),
    oneLiner: text(F.oneLiner.limits, mode, true),
    productType: z.enum(PRODUCT_TYPES),
    availability: z.enum(AVAILABILITY),
    launchDate: z
      .string()
      .regex(ISO_DATE, "Use a date like 2026-12-31")
      .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Use a real date")
      .refine(
        (v) => mode === "draft" || Date.parse(`${v}T23:59:59Z`) > Date.now(),
        "Pick a date in the future",
      ),
    existingUrl: httpsUrl(F.existingUrl.limits.max, mode),
    niche: NicheCategoryEnum,

    primaryGoal: z.enum(PRIMARY_GOALS),
    audienceDescription: text(F.audienceDescription.limits, mode, true),
    audienceSegment: z.enum(AUDIENCE_SEGMENTS),
    audienceDetails: z
      .object({
        industry: text(F.audienceDetails.limits.industry, mode).optional(),
        companySize: text(F.audienceDetails.limits.companySize, mode).optional(),
        region: text(F.audienceDetails.limits.region, mode).optional(),
        techLevel: z.enum(TECH_LEVELS).optional(),
      })
      .strict(),
    buyer: z
      .object({
        sameAsUser: z.boolean(),
        description: text(F.buyer.limits.description, mode).optional(),
      })
      .strict(),
    problem: text(F.problem.limits, mode, true),
    valueProp: text(F.valueProp.limits, mode),
    siteType: z.enum(BRIEF_SITE_TYPES),
    language: z.enum(BRIEF_LANGUAGES),

    features: list(
      z
        .object({
          title: text(featureLimits.title, mode),
          benefit: text(featureLimits.benefit, mode, true),
        })
        .strict(),
      featureLimits.maxItems,
      featureLimits.minItems,
      mode,
    ),
    howItWorks: z
      .object({
        steps: list(
          z
            .object({
              title: text(howLimits.title, mode),
              description: text(howLimits.description, mode, true),
            })
            .strict(),
          howLimits.maxItems,
          howLimits.minItems,
          mode,
        ),
        onboardingNote: text(howLimits.onboardingNote, mode).optional(),
      })
      .strict(),
    differentiators: list(text(F.differentiators.limits.item, mode), F.differentiators.limits.maxItems, 0, mode),
    competitors: list(
      z
        .object({
          name: text(F.competitors.limits.name, mode),
          url: httpsUrl(500, mode).optional(),
        })
        .strict(),
      F.competitors.limits.maxItems,
      0,
      mode,
    ),
    currentAlternative: text(F.currentAlternative.limits, mode),
    allowCompetitorComparison: z.boolean(),
    pricing: z
      .object({
        mode: z.enum(PRICING_MODES),
        plans: list(
          z
            .object({
              name: text(pricingLimits.planName, mode),
              price: draftOr(mode, (v) => DECIMAL_PRICE.test(v), "Use a price like 19 or 19.99"),
              currency: draftOr(mode, (c) => ISO_4217.has(c), "Use a currency code like USD"),
              interval: z.enum(PRICE_INTERVALS),
              features: list(text(pricingLimits.planFeature, mode), pricingLimits.planFeatures, 0, mode),
              highlighted: z.boolean(),
            })
            .strict(),
          pricingLimits.maxPlans,
          0,
          mode,
        ).optional(),
        trialNote: text(pricingLimits.trialNote, mode).optional(),
        notes: text(pricingLimits.notes, mode).optional(),
      })
      .strict()
      .superRefine((v, ctx) => {
        if (mode === "submit" && v.mode === "SHOW_PLANS" && !(v.plans && v.plans.length > 0)) {
          ctx.addIssue({ code: "custom", path: ["plans"], message: "Add at least one plan, or choose another option" })
        }
      }),

    ctaPrimary: ctaSchema(mode),
    ctaSecondary: ctaSchema(mode),
    contactEmail: z.string().max(F.contactEmail.limits.max).email("Use a valid email address"),
    showContactPublicly: z.boolean(),
    afterConversion: z
      .object({
        message: text(F.afterConversion.limits.message, mode, true),
        notifyEmail: z.string().max(254).email("Use a valid email address").optional(),
        expectedResponseTime: text(F.afterConversion.limits.expectedResponseTime, mode).optional(),
      })
      .strict(),

    logo: uploadRef,
    brandColors: list(z.string().regex(HEX_COLOR, "Use a hex color like #1A2B3C"), F.brandColors.limits.maxItems, 0, mode),
    fontPreference: text(F.fontPreference.limits, mode),
    tone: list(z.enum(TONES), F.tone.limits.maxItems, 0, mode),
    designReferences: list(
      z
        .object({
          url: httpsUrl(F.designReferences.limits.url, mode),
          note: text(F.designReferences.limits.note, mode).optional(),
          redesignFrom: z.boolean(),
        })
        .strict(),
      F.designReferences.limits.maxItems,
      0,
      mode,
    ),
    visualNotes: text(F.visualNotes.limits, mode, true),
    sourceDocument: uploadRef,

    testimonials: list(
      z
        .object({
          quote: text(testimonialLimits.quote, mode, true),
          personName: text(testimonialLimits.personName, mode),
          role: text(testimonialLimits.role, mode).optional(),
          company: text(testimonialLimits.company, mode).optional(),
          permissionConfirmed: z.boolean(),
        })
        .strict(),
      testimonialLimits.maxItems,
      0,
      mode,
    ),
    trustedBy: list(text(F.trustedBy.limits.item, mode), F.trustedBy.limits.maxItems, 0, mode),
    metrics: list(
      z
        .object({
          value: text(metricLimits.value, mode),
          label: text(metricLimits.label, mode),
          sourceNote: text(metricLimits.sourceNote, mode),
        })
        .strict(),
      metricLimits.maxItems,
      0,
      mode,
    ),
    certifications: list(
      z.object({ name: text(F.certifications.limits.name, mode) }).strict(),
      F.certifications.limits.maxItems,
      0,
      mode,
    ),
    proofAttested: z.boolean(),
    faq: list(
      z.object({ q: text(F.faq.limits.q, mode), a: text(F.faq.limits.a, mode, true) }).strict(),
      F.faq.limits.maxItems,
      0,
      mode,
    ),
    objections: text(F.objections.limits, mode, true),

    socialLinks: z
      .object(
        Object.fromEntries(SOCIAL_NETWORKS.map((n) => [n, z.string().max(F.socialLinks.limits.url).optional()])) as Record<
          (typeof SOCIAL_NETWORKS)[number],
          z.ZodOptional<z.ZodString>
        >,
      )
      .strict()
      .superRefine((v, ctx) => {
        for (const [network, url] of Object.entries(v)) {
          if (url && !isSocialUrl(network, url)) {
            ctx.addIssue({ code: "custom", path: [network], message: "Use a full https:// link to that network" })
          }
        }
      }),
    phone: z.string().max(F.phone.limits.max).refine((v) => v === "" || PHONE.test(v), "Use digits, spaces, + ( ) - ."),
    companyAddress: text(F.companyAddress.limits, mode, true),
    legal: z
      .object({
        mode: z.enum(LEGAL_MODES),
        privacyUrl: httpsUrl(F.legal.limits.url, mode).optional(),
        termsUrl: httpsUrl(F.legal.limits.url, mode).optional(),
        legalEntityName: text(F.legal.limits.legalEntityName, mode).optional(),
        country: text(F.legal.limits.country, mode).optional(),
      })
      .strict()
      .superRefine((v, ctx) => {
        if (mode === "submit" && v.mode === "LINK_OWN" && !v.privacyUrl) {
          ctx.addIssue({ code: "custom", path: ["privacyUrl"], message: "Add your privacy policy link" })
        }
      }),

    trafficSources: list(z.enum(TRAFFIC_SOURCES), TRAFFIC_SOURCES.length, 0, mode),
    targetKeywords: list(text(F.targetKeywords.limits.item, mode), F.targetKeywords.limits.maxItems, 0, mode),
    campaignMessage: text(F.campaignMessage.limits, mode),
  } satisfies Record<FieldId, z.ZodTypeAny>
}

export const BRIEF_DRAFT_FIELDS = buildFieldSchemas("draft")
export const BRIEF_SUBMIT_FIELDS = buildFieldSchemas("submit")

export const BriefDataSchema = z.object(BRIEF_DRAFT_FIELDS).partial().strict()
export type BriefData = z.infer<typeof BriefDataSchema>

type SubmitFields = typeof BRIEF_SUBMIT_FIELDS
export type BriefSubmitData = { [K in FieldId]?: z.infer<SubmitFields[K]> }

export type BriefFieldErrors = Record<string, string[]>

function issuesToErrors(prefix: string, error: z.ZodError, into: BriefFieldErrors): void {
  for (const issue of error.issues) {
    const key = [prefix, ...issue.path].join(".")
    ;(into[key] ??= []).push(issue.message)
  }
}

export function validateFieldValue(id: FieldId, value: unknown, mode: SchemaMode): { ok: true; value: unknown } | { ok: false; errors: BriefFieldErrors } {
  const schema = (mode === "draft" ? BRIEF_DRAFT_FIELDS : BRIEF_SUBMIT_FIELDS)[id] as z.ZodTypeAny
  const parsed = schema.safeParse(value)
  if (parsed.success) return { ok: true, value: parsed.data }
  const errors: BriefFieldErrors = {}
  issuesToErrors(id, parsed.error, errors)
  return { ok: false, errors }
}

// Proof rules that hold on every submitted or attached brief: each quote has
// permission, and any proof list carries the attestation.
export function proofErrors(data: BriefData): BriefFieldErrors {
  const errors: BriefFieldErrors = {}
  data.testimonials?.forEach((t, i) => {
    if (!t.permissionConfirmed) {
      ;(errors[`testimonials.${i}.permissionConfirmed`] ??= []).push("Confirm you have permission to publish this quote")
    }
  })
  const hasProof = ATTESTED_PROOF_FIELDS.some((f) => !isBlankValue(data[f]))
  if (hasProof && data.proofAttested !== true) {
    ;(errors.proofAttested ??= []).push("Confirm these are accurate and you're allowed to show them")
  }
  return errors
}

export function validateForSubmit(data: BriefData): { ok: true } | { ok: false; errors: BriefFieldErrors } {
  const errors: BriefFieldErrors = {}
  for (const id of REQUIRED_FIELD_IDS) {
    if (isBlankValue(data[id])) (errors[id] ??= []).push("Required")
  }
  for (const [id, value] of Object.entries(data)) {
    if (value === undefined) continue
    const result = validateFieldValue(id as FieldId, value, "submit")
    if (!result.ok) Object.assign(errors, result.errors)
  }
  Object.assign(errors, proofErrors(data))
  return Object.keys(errors).length === 0 ? { ok: true } : { ok: false, errors }
}
