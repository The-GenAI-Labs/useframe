// Duplicated from apps/billing-service/src/lib/pricing.ts — same tiered
// credit pricing, kept as a small intentional duplication (matching this
// repo's precedent, e.g. the independent redis-client files) rather than a
// new shared package for one function. Keep both copies in sync if the
// pricing tiers change.
const ANCHORS: { amountCents: number; credits: number }[] = [
  { amountCents: 900, credits: 10 },
  { amountCents: 1900, credits: 22 },
  { amountCents: 4900, credits: 65 },
  { amountCents: 9900, credits: 150 },
]

export function creditsForAmount(amountCents: number): number {
  const first = ANCHORS[0]!
  const last = ANCHORS[ANCHORS.length - 1]!

  if (amountCents <= first.amountCents) {
    return Math.max(1, Math.round((amountCents / first.amountCents) * first.credits))
  }
  if (amountCents >= last.amountCents) {
    const prev = ANCHORS[ANCHORS.length - 2]!
    const rate = (last.credits - prev.credits) / (last.amountCents - prev.amountCents)
    return Math.round(last.credits + (amountCents - last.amountCents) * rate)
  }

  for (let i = 0; i < ANCHORS.length - 1; i++) {
    const lo = ANCHORS[i]!
    const hi = ANCHORS[i + 1]!
    if (amountCents >= lo.amountCents && amountCents <= hi.amountCents) {
      const t = (amountCents - lo.amountCents) / (hi.amountCents - lo.amountCents)
      return Math.round(lo.credits + t * (hi.credits - lo.credits))
    }
  }

  return Math.floor(amountCents / 90)
}
