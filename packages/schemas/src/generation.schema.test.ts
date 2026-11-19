import { describe, expect, it } from "vitest"
import {
  bannedPhraseIn,
  checkSectionContent,
  checkSpecQuality,
  contentContract,
  FONT_PAIRINGS,
  groundedIn,
  inventedClaims,
  overlapRatio,
  isPlaceholder,
  repeatsLayout,
} from "./generation.schema.js"
import type { Section } from "./siteSpec.js"

describe("copy rules", () => {
  it("catches banned phrases in any case and hyphenation", () => {
    expect(bannedPhraseIn("A Seamless way to book")).toBe("seamless")
    expect(bannedPhraseIn("cutting edge scheduling")).toBe("cutting edge")
    expect(bannedPhraseIn("This will Elevate your team")).toBe("elevate")
    expect(bannedPhraseIn("In today’s fast-paced world")).not.toBeNull()
    expect(bannedPhraseIn("Book visits in two taps")).toBeNull()
    expect(bannedPhraseIn("elevator pitch")).toBeNull()
  })

  it("recognises placeholder text, including the old copy-agent fallback", () => {
    for (const text of ["HERO Section", "FEATURES section", "Lorem ipsum dolor", "[Your company]", "TBD", "headline", "{{name}}"]) {
      expect(isPlaceholder(text), text).toBe(true)
    }
    expect(isPlaceholder("Fill every chair without phone tag")).toBe(false)
  })

  it("flags proof claims the facts do not contain", () => {
    expect(inventedClaims("Join 10,000+ happy customers", "a booking tool")).toEqual(["10,000+ happy customers"])
    expect(inventedClaims("Cut no-shows by 38%", "")).toEqual(["38%"])
    expect(inventedClaims("Award-winning support", "")).toEqual(["Award-winning"])
    expect(inventedClaims("Rated 4.9/5", "")).toHaveLength(1)
    expect(inventedClaims("Used by 4,200 clinics", '{"metrics":[{"value":"4,200","label":"clinics"}]}')).toEqual([])
    expect(inventedClaims("Set up in 5 minutes, 24/7 support", "")).toEqual([])
  })

  it("enforces each section's contract", () => {
    const hero = checkSectionContent("HERO", "split", { headline: "x".repeat(71), cta: { primary: "Go" } }, "")
    expect(hero.map((i) => `${i.code}:${i.path}`)).toEqual(expect.arrayContaining(["limit:headline", "missing:subheadline", "limit:cta.primary"]))
    const bento = checkSectionContent("FEATURES", "bento", { headline: "What you get", items: [{ title: "a", description: "b" }] }, "")
    expect(bento.some((i) => i.code === "items")).toBe(true)
    expect(contentContract("FAQ").items).toMatchObject({ min: 4, titleMax: 90, descriptionMax: 300 })
    expect(checkSectionContent("CTA", undefined, { headline: "Book your first visit", cta: { primary: "Book a visit" } }, "")).toEqual([])
  })

  it("flags a subheadline that only restates its headline", () => {
    const restated = checkSectionContent("FEATURES", "grid", {
      headline: "Fewer ingredients to question",
      subheadline: "Fewer ingredients to question, and a shorter routine to keep.",
      items: [1, 2, 3].map((i) => ({ title: `Item ${i}`, description: `A real description of item number ${i}.` })),
    }, "")
    expect(restated.map((i) => i.code)).toContain("restated")
    expect(overlapRatio("Fill every chair without phone tag", "Patients book and confirm visits online.")).toBe(0)
  })

  it("verifies that a cited basis really comes from the facts", () => {
    const facts = "An open-source tool that records production errors with the exact request and database queries that caused them"
    expect(groundedIn("records production errors with the exact request", facts)).toBe(true)
    expect(groundedIn("redacts sensitive fields before storage", facts)).toBe(false)
    expect(groundedIn(undefined, facts)).toBe(false)
  })

  it("ships 14 curated font pairings", () => {
    expect(FONT_PAIRINGS).toHaveLength(14)
    expect(new Set(FONT_PAIRINGS.map((p) => p.id)).size).toBe(14)
  })
})

describe("spec quality", () => {
  const page = (sections: Section[]) => ({ pages: [{ type: "HOME" as const, slug: "home", title: "Home", sections }] })

  it("finds repetition, layout repeats, CTA drift and proof without facts", () => {
    const issues = checkSpecQuality(
      page([
        { type: "HERO", index: 0, variant: "centered", content: { headline: "Book visits online", subheadline: "s", cta: { primary: "Start free trial" } } },
        { type: "FEATURES", index: 1, variant: "grid", content: { headline: "Book visits faster", items: [1, 2, 3].map((i) => ({ title: `t${i}`, description: "d" })) } },
        { type: "TESTIMONIALS", index: 2, variant: "cards", content: { items: [{ title: "Tim", description: "Great" }] } },
        { type: "CTA", index: 3, variant: "banner", content: { headline: "Book visits online", cta: { primary: "Try it now" } } },
      ]),
      { facts: "" },
    )
    const codes = issues.map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(["repeated_opening", "duplicate_headline", "adjacent_variant", "cta_inconsistent", "invented_proof"]))
  })

  it("allows proof sections the user supplied facts for", () => {
    const issues = checkSpecQuality(page([{ type: "TESTIMONIALS", index: 0, content: { items: [{ title: "Ana", description: "Great" }] } }]), {
      facts: "",
      proof: { testimonials: true },
    })
    expect(issues).toEqual([])
  })

  it("treats different card grids as the same layout but not a grid next to a list", () => {
    expect(repeatsLayout({ type: "FEATURES", variant: "grid" }, { type: "TESTIMONIALS", variant: "cards" })).toBe(true)
    expect(repeatsLayout({ type: "FEATURES", variant: "grid" }, { type: "FAQ", variant: "accordion" })).toBe(false)
    expect(repeatsLayout(undefined, { type: "FAQ", variant: "accordion" })).toBe(false)
  })
})
