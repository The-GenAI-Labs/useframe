import type { PaidTierPageData } from "../lib/paidTierExtract.js"

export const LIGHTHOUSE_WEIGHT = 0.85
export const PAID_SIGNALS_WEIGHT = 0.15

const JSON_LD_PENALTY = 10
const NO_INTERNAL_LINKS_PENALTY = 5

export type ScoringInput = {
  lighthouseSeoScore: number
  paidTierData?: PaidTierPageData[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function computeAdditiveScore(pages: PaidTierPageData[]): number {
  if (pages.length === 0) return 100

  const perPageScores = pages.map((page) => {
    let score = 100
    if (page.jsonLd.length === 0) score -= JSON_LD_PENALTY
    if (page.links.internalCount === 0) score -= NO_INTERNAL_LINKS_PENALTY
    return clamp(score, 0, 100)
  })

  const average = perPageScores.reduce((sum, s) => sum + s, 0) / perPageScores.length
  return Math.round(average)
}

export function computeSeoScore(input: ScoringInput): number {
  const { lighthouseSeoScore, paidTierData } = input

  if (!paidTierData || paidTierData.length === 0) {
    return Math.round(clamp(lighthouseSeoScore, 0, 100))
  }

  const additiveScore = computeAdditiveScore(paidTierData)
  const weighted = lighthouseSeoScore * LIGHTHOUSE_WEIGHT + additiveScore * PAID_SIGNALS_WEIGHT
  return Math.round(clamp(weighted, 0, 100))
}
