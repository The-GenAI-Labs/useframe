// Fixed credit packs, plus a custom-amount path above/between them.
export const CREDIT_PACKS = [
  { amountCents: 1900, credits: 10 }, // $19 → 10cr ($1.90/credit)
  { amountCents: 4900, credits: 25 }, // $49 → 25cr ($1.96/credit)
  { amountCents: 9900, credits: 60 }, // $99 → 60cr ($1.65/credit)
] as const

// NOTE, intentionally left visible for whoever revisits this:
// the $49 pack is priced WORSE per-credit ($1.96) than the $19 pack
// ($1.90) — a bigger pack normally beats the smaller one on a per-unit
// basis. Kept as specified — if this was meant as a deliberate decoy
// (nudging toward the $99 pack, a real documented pricing pattern), fine
// as-is. If it was an oversight, the fix is raising $49's credits to ~26-27
// to restore normal tiering.

export const CUSTOM_MIN_AMOUNT_CENTS = 1000 // $10 floor
export const CUSTOM_MIN_CREDITS = 5
export const CUSTOM_RATE_CENTS_PER_CREDIT = 200 // $2.00/credit — the worst rate, by design; custom is the convenience option

export type CreditPack = (typeof CREDIT_PACKS)[number]

export function findCreditPack(amountCents: number): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.amountCents === amountCents)
}

// Credits for a custom (non-pack) amount. Floored, so a user never gets a
// fractional credit rounded in their favour.
export function creditsForCustomAmount(amountCents: number): number {
  return Math.floor(amountCents / CUSTOM_RATE_CENTS_PER_CREDIT)
}
