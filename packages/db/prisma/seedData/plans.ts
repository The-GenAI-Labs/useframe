// The checkout plans. The database is the source of truth at runtime; this file
// only seeds it. Names, descriptions and features are marketing copy, edited freely.

// TODO(pricing): placeholder credit grant at the current $0.50-per-credit rate so
// existing credit logic keeps working. Replace with the real per-plan grant.
const PLACEHOLDER_USD_PER_CREDIT = 0.5
const placeholderCredits = (priceMinor: number) => Math.round(priceMinor / 100 / PLACEHOLDER_USD_PER_CREDIT)

export type PlanSeed = {
  slug: string
  name: string
  description: string
  priceMinor: number
  currency: string
  credits: number
  features: string[]
  highlighted: boolean
  sortOrder: number
}

export const PLAN_SEEDS: PlanSeed[] = [
  {
    slug: "starter",
    name: "Starter",
    description: "One real site, fully iterated",
    priceMinor: 4900,
    currency: "USD",
    credits: placeholderCredits(4900),
    features: [
      "Unlimited generations & iterations",
      "Full 4-step pipeline — Research, Build, SEO, Deploy",
      "Web Score checking on any URL",
      "Research-backed design citations",
    ],
    highlighted: false,
    sortOrder: 1,
  },
  {
    slug: "studio",
    name: "Studio",
    description: "For shipping pages regularly",
    priceMinor: 9900,
    currency: "USD",
    credits: placeholderCredits(9900),
    features: [
      "Everything in Starter",
      "Priority generation speed",
      "Custom domains on deploy",
      "Deeper research citation coverage",
      "Priority support",
    ],
    highlighted: true,
    sortOrder: 2,
  },
  {
    slug: "agency",
    name: "Agency",
    description: "Best rate, for heavy use",
    priceMinor: 19900,
    currency: "USD",
    credits: placeholderCredits(19900),
    features: [
      "Everything in Studio",
      "Full access to every research paper",
      "Unlimited Web Score & SEO audits",
      "Team workspaces",
      "Priority support, front of the queue",
    ],
    highlighted: false,
    sortOrder: 3,
  },
]
