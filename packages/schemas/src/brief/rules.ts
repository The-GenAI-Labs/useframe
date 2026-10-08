import type { FieldId } from "./catalog.js"

export const PROOF_PATHS = [
  "testimonials",
  "trustedBy",
  "metrics",
  "certifications",
  "pricing.plans",
  "proofAttested",
] as const
export type ProofPath = (typeof PROOF_PATHS)[number]

export const ATTESTED_PROOF_FIELDS = ["testimonials", "trustedBy", "metrics", "certifications"] as const

export const CLAIM_PATHS = ["valueProp", "differentiators"] as const satisfies readonly FieldId[]

const CONTROL_CHARS_MULTILINE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/
const CONTROL_CHARS_SINGLELINE = /[\u0000-\u001F\u007F‪-‮⁦-⁩]/

export function hasControlChars(value: string, multiline = false): boolean {
  return (multiline ? CONTROL_CHARS_MULTILINE : CONTROL_CHARS_SINGLELINE).test(value)
}

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
export const DECIMAL_PRICE = /^\d{1,7}(?:\.\d{1,2})?$/
export const PHONE = /^[0-9+()\-.\s]{3,30}$/
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Active ISO-4217 codes.
export const ISO_4217 = new Set(
  (
    "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD " +
    "CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD " +
    "GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT " +
    "LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR " +
    "NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP " +
    "STN SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF " +
    "YER ZAR ZMW ZWL"
  ).split(" "),
)

export const SOCIAL_HOSTS: Record<string, string[] | null> = {
  linkedin: ["linkedin.com"],
  x: ["x.com", "twitter.com"],
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  youtube: ["youtube.com", "youtu.be"],
  github: ["github.com"],
  other: null,
}

function hostMatches(host: string, domains: string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, "")
  return domains.some((d) => h === d || h.endsWith(`.${d}`))
}

// The only scheme accepted for stored links. mailto:/tel: are produced
// from email/phone fields by the site builder, never stored as URLs, so
// javascript:, data:, vbscript:, file: and everything else are rejected.
export function parseHttpsUrl(value: string, maxLength = 500): URL | null {
  if (value.length > maxLength || hasControlChars(value) || /\s/.test(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== "https:") return null
  if (url.username || url.password) return null
  if (!url.hostname || !url.hostname.includes(".")) return null
  return url
}

export function isHttpsUrl(value: string, maxLength = 500): boolean {
  return parseHttpsUrl(value, maxLength) !== null
}

export function isSocialUrl(network: string, value: string): boolean {
  const url = parseHttpsUrl(value)
  if (!url) return false
  const domains = SOCIAL_HOSTS[network]
  if (domains === undefined) return false
  return domains === null || hostMatches(url.hostname, domains)
}

// Final gate for any href written into a generated site.
export function safeHref(value: unknown): string | null {
  if (typeof value !== "string") return null
  const v = value.trim()
  if (!v || hasControlChars(v)) return null
  if (/^#[A-Za-z0-9_-]{0,64}$/.test(v)) return v
  if (/^mailto:/i.test(v)) {
    const address = v.slice(7)
    return /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/.test(address) ? `mailto:${address}` : null
  }
  if (/^tel:/i.test(v)) {
    const number = v.slice(4)
    return PHONE.test(number) ? `tel:${number.replace(/[\s().-]/g, "")}` : null
  }
  const url = parseHttpsUrl(v, 2000)
  return url ? url.toString() : null
}

const BANNED_CLAIM_TERMS = [
  "best",
  "leading",
  "fastest",
  "fastest-growing",
  "number one",
  "#1",
  "only",
  "first",
  "guaranteed",
  "award",
  "awards",
  "certified",
  "compliant",
  "ISO",
  "SOC",
  "GDPR",
  "HIPAA",
  "unlimited",
  "24/7",
  "trusted by",
]

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
}

function wholeWord(term: string): RegExp {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(term)}(?=$|[^\\p{L}\\p{N}])`, "iu")
}

const BANNED_PATTERNS = BANNED_CLAIM_TERMS.map((term) => ({ term, re: wholeWord(term) }))

export type ClaimCheck = { ok: boolean; violations: string[] }

// Deterministic filter for AI-drafted claim text. Anything that reads like a
// verifiable marketing claim (numbers, superlatives, compliance badges,
// competitor names) is rejected rather than trusted to the prompt.
export function checkClaim(text: string, competitorNames: string[] = []): ClaimCheck {
  const violations: string[] = []
  if (/\p{N}/u.test(text)) violations.push("contains a number")
  if (text.includes("%")) violations.push("contains a percentage")
  for (const { term, re } of BANNED_PATTERNS) {
    if (re.test(text)) violations.push(`uses "${term}"`)
  }
  for (const name of competitorNames) {
    const trimmed = name.trim()
    if (trimmed.length >= 2 && wholeWord(trimmed).test(text)) violations.push("names a competitor")
  }
  return { ok: violations.length === 0, violations: [...new Set(violations)] }
}

export function valueAtPath(data: Record<string, unknown>, path: string): unknown {
  let current: unknown = data
  for (const key of path.split(".")) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function isBlankValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "object") return Object.values(value).every(isBlankValue)
  return false
}

export function proofPathsForField(field: string): ProofPath[] {
  return PROOF_PATHS.filter((p) => p === field || p.startsWith(`${field}.`))
}
