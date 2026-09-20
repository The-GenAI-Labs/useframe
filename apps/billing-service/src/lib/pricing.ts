// Tiered credit pricing: the more you buy, the better the effective rate.
// Anchor points (amountCents -> credits) define the curve; amounts between
// anchors are linearly interpolated so the rate improves smoothly rather
// than jumping at each tier boundary. Below the first anchor, the first
// tier's rate applies; above the last, the last tier's rate extrapolates.
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

  // Unreachable given the bounds checks above; keeps TS satisfied.
  return Math.floor(amountCents / 90)
}
