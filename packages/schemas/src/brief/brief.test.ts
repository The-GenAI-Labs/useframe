import { describe, expect, it } from "vitest"
import {
  BRIEF_DRAFT_FIELDS,
  BriefWriteError,
  FIELD_DEFS,
  FIELD_IDS,
  INTAKE_ANSWER_KEYS,
  PROOF_PATHS,
  QUICK_STEP_IDS,
  REQUIRED_FIELD_IDS,
  STEP_IDS,
  applyBriefChanges,
  checkClaim,
  dropUnconfirmedImportedProof,
  excludedSectionTypes,
  isSectionAllowed,
  contentAvailability,
  safeHref,
  toLlmSafeView,
  toPipelineInput,
  unconfirmedClaims,
  validateFieldValue,
  validateForSubmit,
  type BriefData,
  type BriefState,
  type IfBlank,
} from "./index.js"

const caps = { formHandler: false, legalPages: false, languages: ["en"] }
const empty: BriefState = { data: {}, meta: {} }

const validRequired: BriefData = {
  productName: "Ledgerly",
  oneLiner: "Ledgerly turns bank exports into tidy monthly books.",
  productType: "SOFTWARE_SAAS",
  availability: "LIVE",
  primaryGoal: "FREE_TRIAL",
  audienceDescription: "Freelance designers",
  problem: "Freelancers lose a weekend every quarter on receipts.",
  features: [
    { title: "Auto-categorise", benefit: "Bank lines sorted without effort." },
    { title: "Receipt match", benefit: "Photos matched to the right line." },
  ],
  ctaPrimary: { label: "Start free", type: "URL", url: "https://ledgerly.app/signup" },
  contactEmail: "hi@ledgerly.app",
}

describe("catalog integrity", () => {
  it("has a schema for every field and a field for every schema", () => {
    expect(Object.keys(BRIEF_DRAFT_FIELDS).sort()).toEqual([...FIELD_IDS].sort())
  })

  it("gives every field a valid step, an ifBlank rule and copy", () => {
    for (const id of FIELD_IDS) {
      const def = FIELD_DEFS[id]
      expect(STEP_IDS).toContain(def.step)
      expect(def.ifBlank).toBeDefined()
      expect(def.label.length).toBeGreaterThan(0)
      expect(def.help.length).toBeGreaterThan(0)
      if (def.tier !== "required") expect((def.ifBlank as IfBlank).kind).not.toBe("required")
      else expect((def.ifBlank as IfBlank).kind).toBe("required")
    }
  })

  it("only omits proof when blank", () => {
    for (const id of FIELD_IDS) {
      const def = FIELD_DEFS[id] as { proof?: boolean; ifBlank: IfBlank }
      if (def.proof && id !== "proofAttested") expect(def.ifBlank.kind).toBe("omit")
    }
  })

  it("has no duplicate ids and the quick view stays at four screens", () => {
    expect(new Set(FIELD_IDS).size).toBe(FIELD_IDS.length)
    expect(REQUIRED_FIELD_IDS).toHaveLength(10)
    expect(QUICK_STEP_IDS).toEqual(["about", "goal", "product", "cta"])
  })
})

describe("validators", () => {
  it("rejects dangerous URL schemes everywhere", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd", "http://a.com", "ftp://a.com"]) {
      expect(validateFieldValue("existingUrl", url, "draft").ok).toBe(false)
      expect(safeHref(url)).toBeNull()
    }
    expect(validateFieldValue("existingUrl", "https://ledgerly.app", "draft").ok).toBe(true)
    expect(safeHref("https://ledgerly.app/x")).toBe("https://ledgerly.app/x")
    expect(safeHref("mailto:hi@ledgerly.app")).toBe("mailto:hi@ledgerly.app")
    expect(safeHref("mailto:x@y.z?body=<script>")).toBeNull()
  })

  it("enforces list caps, hex colors, social hosts and currency", () => {
    expect(validateFieldValue("trustedBy", Array.from({ length: 11 }, (_, i) => `Co ${i}`), "draft").ok).toBe(false)
    expect(validateFieldValue("brandColors", ["#12345G"], "draft").ok).toBe(false)
    expect(validateFieldValue("brandColors", ["#123456", "#abc"], "draft").ok).toBe(true)
    expect(validateFieldValue("socialLinks", { linkedin: "https://evil.com/in/x" }, "draft").ok).toBe(false)
    expect(validateFieldValue("socialLinks", { linkedin: "https://www.linkedin.com/in/x", other: "https://blog.example.com" }, "draft").ok).toBe(true)
    const plan = { name: "Pro", price: "19.99", currency: "XYZ", interval: "MONTHLY", features: [], highlighted: false }
    expect(validateFieldValue("pricing", { mode: "SHOW_PLANS", plans: [plan] }, "draft").ok).toBe(false)
    expect(validateFieldValue("pricing", { mode: "SHOW_PLANS", plans: [{ ...plan, currency: "USD" }] }, "draft").ok).toBe(true)
    expect(validateFieldValue("pricing", { mode: "SHOW_PLANS", plans: [{ ...plan, currency: "USD", price: "19,99" }] }, "draft").ok).toBe(false)
  })

  it("rejects control characters and allows partial drafts", () => {
    expect(validateFieldValue("productName", "Led\u0000ger", "draft").ok).toBe(false)
    expect(validateFieldValue("oneLiner", "short", "draft").ok).toBe(true)
    expect(validateFieldValue("oneLiner", "short", "submit").ok).toBe(false)
  })

  it("requires the ten quick fields on submit", () => {
    expect(validateForSubmit(validRequired).ok).toBe(true)
    const { contactEmail: _c, ...missing } = validRequired
    const result = validateForSubmit(missing)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.contactEmail).toBeDefined()
  })

  it("requires attestation and per-quote permission for proof", () => {
    const withProof: BriefData = {
      ...validRequired,
      testimonials: [{ quote: "It saved my weekends.", personName: "Ana", permissionConfirmed: false }],
    }
    const result = validateForSubmit(withProof)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors["testimonials.0.permissionConfirmed"]).toBeDefined()
      expect(result.errors.proofAttested).toBeDefined()
    }
  })
})

describe("provenance", () => {
  it("marks user edits confirmed and suggestions unconfirmed", () => {
    const user = applyBriefChanges(empty, { set: { productName: "Ledgerly" } }, { source: "user" })
    expect(user.meta.productName).toMatchObject({ source: "user", confirmed: true })

    const imported = applyBriefChanges(empty, { set: { productName: "Ledgerly" } }, { source: "imported", confidence: { productName: 0.7 } })
    expect(imported.meta.productName).toMatchObject({ source: "imported", confirmed: false, confidence: 0.7 })

    const assumed = applyBriefChanges(empty, { set: { audienceSegment: "B2B" } }, { source: "assumed", confidence: { audienceSegment: 0.6 } })
    expect(assumed.meta.audienceSegment).toMatchObject({ source: "assumed", confirmed: false })
  })

  it("never lets a non-user source overwrite the user", () => {
    const user = applyBriefChanges(empty, { set: { productName: "Mine" } }, { source: "user" })
    for (const source of ["imported", "assumed", "researched", "default"] as const) {
      const next = applyBriefChanges(user, { set: { productName: "Theirs" } }, { source, confidence: { productName: 1 } })
      expect(next.data.productName).toBe("Mine")
      expect(next.skipped).toContain("productName")
    }
  })

  it("replaces an earlier pre-fill only with higher confidence", () => {
    const first = applyBriefChanges(empty, { set: { productName: "A" } }, { source: "imported", confidence: { productName: 0.5 } })
    const lower = applyBriefChanges(first, { set: { productName: "B" } }, { source: "imported", confidence: { productName: 0.4 } })
    expect(lower.data.productName).toBe("A")
    const higher = applyBriefChanges(first, { set: { productName: "C" } }, { source: "imported", confidence: { productName: 0.9 } })
    expect(higher.data.productName).toBe("C")
  })

  it("does not replace a list the user edited", () => {
    const features = validRequired.features!
    const user = applyBriefChanges(empty, { set: { features } }, { source: "user" })
    const next = applyBriefChanges(user, { set: { features: [features[1]!, features[0]!] } }, { source: "imported", confidence: { features: 1 } })
    expect(next.data.features).toEqual(features)
  })

  it("rejects non-user sources on every proof path", () => {
    const proof: Record<string, unknown> = {
      testimonials: [{ quote: "Apple loves it so much.", personName: "Tim", permissionConfirmed: true }],
      trustedBy: ["Apple"],
      metrics: [{ value: "10x", label: "faster", sourceNote: "us" }],
      certifications: [{ name: "SOC 2" }],
      pricing: { mode: "SHOW_PLANS", plans: [{ name: "Pro", price: "9", currency: "USD", interval: "MONTHLY", features: [], highlighted: false }] },
      proofAttested: true,
    }
    expect(Object.keys(proof).sort()).toEqual([...new Set(PROOF_PATHS.map((p) => p.split(".")[0]))].sort())
    for (const source of ["assumed", "researched", "default"] as const) {
      for (const [field, value] of Object.entries(proof)) {
        expect(() => applyBriefChanges(empty, { set: { [field]: value } }, { source })).toThrow(BriefWriteError)
      }
    }
    expect(() => applyBriefChanges(empty, { set: { pricing: { mode: "HIDE" } } }, { source: "default" })).not.toThrow()
    expect(() => applyBriefChanges(empty, { set: { trustedBy: ["Apple"] } }, { source: "imported" })).not.toThrow()
  })

  it("enforces proof attestation on strict writes", () => {
    expect(() =>
      applyBriefChanges(empty, { set: { trustedBy: ["Acme"] } }, { source: "user", strictProof: true }),
    ).toThrow(BriefWriteError)
    expect(() =>
      applyBriefChanges(empty, { set: { trustedBy: ["Acme"], proofAttested: true } }, { source: "user", strictProof: true }),
    ).not.toThrow()
  })

  it("drops unticked imported proof at submit", () => {
    const state = applyBriefChanges(empty, { set: { trustedBy: ["Apple"] } }, { source: "imported" })
    const result = dropUnconfirmedImportedProof(state)
    expect(result.data.trustedBy).toBeUndefined()
    expect(result.dropped).toEqual(["trustedBy"])
  })

  it("tracks assumed claims until confirmed", () => {
    const state = applyBriefChanges(empty, { set: { valueProp: "Books done in minutes, not weekends." } }, { source: "assumed" })
    expect(unconfirmedClaims(state)).toEqual(["valueProp"])
    const confirmed = applyBriefChanges(state, { confirm: ["valueProp"] }, { source: "user" })
    expect(unconfirmedClaims(confirmed)).toEqual([])
  })

  it("rejects briefs larger than the cap with 413", () => {
    const oversized = { data: { visualNotes: "x".repeat(70 * 1024) } as BriefData, meta: {} }
    let error: unknown
    try {
      applyBriefChanges(oversized, { set: { productName: "Ledgerly" } }, { source: "user" })
    } catch (err) {
      error = err
    }
    expect(error).toBeInstanceOf(BriefWriteError)
    expect((error as BriefWriteError).status).toBe(413)
  })
})

describe("claim filter", () => {
  it("rejects each banned pattern", () => {
    for (const text of [
      "The best way to do books",
      "Leading bookkeeping tool",
      "Fastest setup around",
      "The fastest-growing app",
      "The number one choice",
      "#1 for freelancers",
      "The only tool you need",
      "First of its kind",
      "Guaranteed savings",
      "Award winning support",
      "Certified accountants",
      "Fully compliant books",
      "ISO ready",
      "SOC ready",
      "GDPR ready",
      "HIPAA ready",
      "Unlimited invoices",
      "Support 24/7",
      "Trusted by freelancers",
      "Saves 5 hours",
      "Saves time%",
    ]) {
      expect(checkClaim(text).ok, text).toBe(false)
    }
  })

  it("rejects competitor names and accepts neutral text", () => {
    expect(checkClaim("Simpler than QuickBooks", ["QuickBooks"]).ok).toBe(false)
    expect(checkClaim("Books done without the weekend of receipts").ok).toBe(true)
    expect(checkClaim("Bestow calm on your bookkeeping").ok).toBe(true)
  })
})

describe("serializers", () => {
  const full: BriefData = {
    ...validRequired,
    phone: "+1 555 0100",
    companyAddress: "1 Main St",
    socialLinks: { github: "https://github.com/ledgerly" },
    afterConversion: { message: "Thanks!", notifyEmail: "ops@ledgerly.app" },
    logo: { uploadId: "clxxxxxxxxxxxxxxxxxxxxxxx", mime: "image/png" },
    testimonials: [{ quote: "It saved my weekends.", personName: "Ana Ruiz", role: "Designer", company: "Studio A", permissionConfirmed: true }],
    proofAttested: true,
  }

  it("strips contact details, uploads and testimonial names from the LLM view", () => {
    const view = JSON.stringify(toLlmSafeView(full))
    for (const secret of ["hi@ledgerly.app", "+1 555 0100", "1 Main St", "github.com/ledgerly", "ops@ledgerly.app", "clxxxxxxxxxxxxxxxxxxxxxxx", "Ana Ruiz", "Studio A"]) {
      expect(view).not.toContain(secret)
    }
    expect(view).toContain("It saved my weekends.")
    expect(Object.keys(toLlmSafeView(full)).sort()).toMatchInlineSnapshot(`
      [
        "afterConversion",
        "audienceDescription",
        "availability",
        "ctaPrimary",
        "features",
        "oneLiner",
        "primaryGoal",
        "problem",
        "productName",
        "productType",
        "proofAttested",
        "testimonials",
      ]
    `)
  })

  it("produces exactly the documented pipeline input", () => {
    const input = toPipelineInput({ data: full, meta: {} }, caps)
    expect(Object.keys(input).sort()).toEqual(
      ["brief", "contentAvailability", "intakeAnswers", "rawIdea", "styleReferences", "userCompetitors"].sort(),
    )
    for (const key of Object.keys(input.intakeAnswers)) expect(INTAKE_ANSWER_KEYS).toContain(key)
    expect(input.rawIdea.length).toBeLessThanOrEqual(1000)
    expect(JSON.stringify(input)).not.toContain("hi@ledgerly.app")
  })

  it("filters sections the brief can't back", () => {
    const none = contentAvailability(validRequired, caps)
    expect(isSectionAllowed("TESTIMONIALS", none)).toBe(false)
    expect(isSectionAllowed("PRICING", none)).toBe(false)
    expect(isSectionAllowed("TEAM", none)).toBe(false)
    expect(isSectionAllowed("FEATURES", none)).toBe(true)
    expect(excludedSectionTypes(none)).toEqual(expect.arrayContaining(["TESTIMONIALS", "PRICING", "TEAM"]))
    expect(isSectionAllowed("TESTIMONIALS", contentAvailability(full, caps))).toBe(true)
  })
})
