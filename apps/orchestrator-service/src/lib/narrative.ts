import type { BriefData, SectionType } from "@repo/schemas"
import type { PlannerDomainPattern } from "@/prompts/planner.prompt.js"

export type ArcSlot = {
  type: SectionType
  job: string
  variant?: string
  // Proof, CUSTOM and detail slots appear only when the brief has the facts for them.
  optional?: boolean
  // A second features section needs enough real features not to repeat or invent.
  needsDetail?: boolean
}

export type ArchetypeId = "product" | "service" | "consumer" | "venue" | "mission"
export type Archetype = { id: ArchetypeId; label: string; arc: ArcSlot[] }

// What the brief can support beyond the section rules: `detail` means at
// least DETAIL_FEATURES real features, enough for a deeper second section.
export type ArcFacts = { detail: boolean }
export const DETAIL_FEATURES = 4

const proof = (type: SectionType, job: string): ArcSlot => ({ type, job, optional: true })
const custom: ArcSlot = { type: "CUSTOM", job: "Why this beats how people solve it today, written only from the brief's differentiators or current alternative.", optional: true }
const detail = (job: string): ArcSlot => ({ type: "FEATURES", job, variant: "alternating", optional: true, needsDetail: true })

// Narrative arcs by business type. Each keeps the promise first and the ask
// last; what differs is what the visitor needs to see second and what sits
// right before the ask.
export const ARCHETYPES: Record<ArchetypeId, Archetype> = {
  product: {
    id: "product",
    label: "product-led software",
    arc: [
      { type: "HERO", job: "What it is, who it is for, why it is better." },
      { type: "FEATURES", job: "The core capabilities, shown before anything else.", variant: "bento" },
      { type: "HOW_IT_WORKS", job: "How a team gets from sign-up to value." },
      proof("LOGOS", "Organisations already using it."),
      proof("STATS", "Real results the user reported."),
      proof("TESTIMONIALS", "Customers vouching for the outcome."),
      detail("A deeper look at capabilities already named in the facts; add none."),
      custom,
      proof("PRICING", "The user's real plans."),
      { type: "FAQ", job: "Setup, data, pricing and fit objections." },
      { type: "CTA", job: "The primary action once more, with the main benefit." },
    ],
  },
  service: {
    id: "service",
    label: "service business",
    arc: [
      { type: "HERO", job: "The outcome the client gets and who it is for." },
      { type: "HOW_IT_WORKS", job: "What working together looks like, step by step." },
      proof("TESTIMONIALS", "Clients vouching for the result."),
      proof("STATS", "Real results the user reported."),
      { type: "FEATURES", job: "The offer: what is included.", variant: "list" },
      custom,
      proof("PRICING", "The user's real fees or packages."),
      proof("TEAM", "The people who do the work."),
      { type: "FAQ", job: "Cost, timing, fit and what happens next." },
      proof("CONTACT", "A direct way to reach a person."),
      { type: "CTA", job: "Book or enquire, with the main benefit." },
    ],
  },
  consumer: {
    id: "consumer",
    label: "consumer product",
    arc: [
      { type: "HERO", job: "The everyday benefit and who it is for." },
      { type: "FEATURES", job: "Benefits in everyday terms.", variant: "grid" },
      detail("The product up close, using only details the facts give; add none."),
      proof("TESTIMONIALS", "Customers vouching for it."),
      proof("LOGOS", "Where it is sold or featured, if supplied."),
      { type: "HOW_IT_WORKS", job: "How to start or what arrives." },
      custom,
      proof("PRICING", "The user's real prices."),
      { type: "FAQ", job: "Price, delivery, safety and cancelling." },
      { type: "CTA", job: "Buy, download or start, with the main benefit." },
    ],
  },
  venue: {
    id: "venue",
    label: "local venue",
    arc: [
      { type: "HERO", job: "The experience and where it is." },
      { type: "FEATURES", job: "What makes a visit special.", variant: "alternating" },
      proof("TESTIMONIALS", "Guests vouching for it."),
      { type: "FAQ", job: "Groups, dietary needs, access and opening days." },
      { type: "HOW_IT_WORKS", job: "How to book or visit, right before the ask." },
      proof("CONTACT", "Address, hours and how to reach them."),
      { type: "CTA", job: "Book or visit." },
    ],
  },
  mission: {
    id: "mission",
    label: "mission-driven organisation",
    arc: [
      { type: "HERO", job: "The mission and the difference help makes." },
      { type: "HOW_IT_WORKS", job: "How help reaches people." },
      proof("STATS", "Real impact numbers the user reported."),
      custom,
      { type: "FAQ", job: "Time commitment, safety, where donations go." },
      { type: "FEATURES", job: "Ways to help, right before the ask.", variant: "grid" },
      { type: "CTA", job: "Volunteer or donate." },
    ],
  },
}

type ArchetypeInput = {
  niche?: string
  idea: string
  brief?: Pick<BriefData, "productType" | "primaryGoal" | "audienceSegment"> | null
}

export function pickArchetype({ niche, idea, brief }: ArchetypeInput): Archetype {
  const text = idea.toLowerCase()
  if (/non-?profit|charit|volunteer|donat|foundation|food bank|mutual aid/.test(text)) return ARCHETYPES.mission
  if (/restaurant|caf[eé]|bistro|bakery|\bbar\b|\bpub\b|hotel|guesthouse|venue|salon|\bspa\b|brewery|winery/.test(text)) return ARCHETYPES.venue
  if (
    brief?.productType === "SERVICE" ||
    brief?.primaryGoal === "INQUIRIES" ||
    /\bservices?\b|\bfirm\b|\blaw\b|legal|coach|consult|agency|\bcare\b|carers?|clinic|therap|tutor|cleaning|repair|accountan|trainer|photograph/.test(text)
  ) {
    return ARCHETYPES.service
  }
  if (
    brief?.productType === "PHYSICAL_PRODUCT" ||
    (brief?.productType === "MOBILE_APP" && brief.audienceSegment !== "B2B") ||
    ["ECOMMERCE", "FOOD_LIFESTYLE", "KIDS", "LUXURY"].includes(niche ?? "") ||
    /skincare|subscription box|apparel|clothing|children|\bkids\b|parents/.test(text)
  ) {
    return ARCHETYPES.consumer
  }
  return ARCHETYPES.product
}

export function arcFactsFor(brief: Pick<BriefData, "features"> | null | undefined): ArcFacts {
  return { detail: (brief?.features?.length ?? 0) >= DETAIL_FEATURES }
}

// The arc as the model sees it: available slots only, in order.
export function arcSlots(archetype: Archetype, allowed: (type: SectionType) => boolean, facts: ArcFacts = { detail: false }): ArcSlot[] {
  return archetype.arc.filter((slot) => !slot.optional || (slot.needsDetail ? facts.detail : allowed(slot.type)))
}

export function arcText(archetype: Archetype, allowed: (type: SectionType) => boolean, pattern?: PlannerDomainPattern | null, facts?: ArcFacts): string {
  const slots = arcSlots(archetype, allowed, facts)
  const lines = slots.map((s, i) => `${i + 1}. ${s.type}${s.variant ? ` (suggested variant: ${s.variant})` : ""} — ${s.job}`)
  const research = pattern
    ? `\nResearch pattern for this domain: typical sections ${pattern.typicalSections.join(", ")}; conversion pattern: ${pattern.conversionPattern}; common objections: ${pattern.commonObjections.join(", ")}.`
    : ""
  return `NARRATIVE ARC for a ${archetype.label} (use these sections in this order; FOOTER follows):\n${lines.join("\n")}${research}`
}

// How many sections of a type the arc can hold with these facts; extras
// would only repeat or invent.
export function arcCapacity(archetype: Archetype, allowed: (type: SectionType) => boolean, facts: ArcFacts): Map<SectionType, number> {
  const capacity = new Map<SectionType, number>()
  for (const slot of arcSlots(archetype, allowed, facts)) capacity.set(slot.type, (capacity.get(slot.type) ?? 0) + 1)
  return capacity
}

// Orders sections to follow the arc: the n-th FEATURES goes to the arc's n-th
// FEATURES slot, and so on. Sections the arc does not place keep their
// relative order just before the final CTA.
export function orderByArc<T extends { type: SectionType }>(sections: T[], archetype: Archetype): T[] {
  const slotsByType = new Map<SectionType, number[]>()
  archetype.arc.forEach((slot, i) => slotsByType.set(slot.type, [...(slotsByType.get(slot.type) ?? []), i]))
  const ctaRank = archetype.arc.findIndex((s) => s.type === "CTA")
  const seen = new Map<SectionType, number>()
  const ranked = sections.map((section, original) => {
    const n = seen.get(section.type) ?? 0
    seen.set(section.type, n + 1)
    const slots = slotsByType.get(section.type) ?? []
    const rank = slots[Math.min(n, slots.length - 1)] ?? ctaRank - 0.5
    return { section, rank: n >= slots.length && slots.length > 0 ? (slots[slots.length - 1] ?? 0) + 0.1 * n : rank, original }
  })
  return ranked.sort((a, b) => a.rank - b.rank || a.original - b.original).map((r) => r.section)
}
