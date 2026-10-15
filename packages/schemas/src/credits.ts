import { z } from "zod"

// Plans (fixed prices) live in the database and are priced by billing-service.
// This is only the custom-amount top-up path.
export const CUSTOM_MIN_AMOUNT_CENTS = 1000 // $10 floor
export const CUSTOM_MAX_AMOUNT_CENTS = 100_000 // $1,000 ceiling for custom top-ups and auto-reload
export const CUSTOM_MIN_CREDITS = 5
export const CUSTOM_RATE_CENTS_PER_CREDIT = 200 // $2.00/credit — the worst rate, by design; custom is the convenience option

// Credits for a custom (non-plan) amount. Floored, so a user never gets a
// fractional credit rounded in their favour.
export function creditsForCustomAmount(amountCents: number): number {
  return Math.floor(amountCents / CUSTOM_RATE_CENTS_PER_CREDIT)
}

// A checkout plan as the public API returns it (GET /api/plans). Prices are minor units.
export const PublicPlanSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string(),
  features: z.array(z.string()),
  highlighted: z.boolean(),
})
export type PublicPlan = z.infer<typeof PublicPlanSchema>

// Checkout takes a plan slug, or a custom amount for a top-up. Any other field
// (price, currency, credits) is dropped: the server prices from the database.
export const CheckoutRequestSchema = z.object({
  planSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,40}$/, "Unknown plan")
    .optional(),
  amountCents: z.number().int().optional(),
})
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>
