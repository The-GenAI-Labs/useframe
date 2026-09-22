export type PerformanceMetrics = {
  ttfb: number
  domContentLoaded: number
  loadComplete: number
  lcp: number
}

export type PerformanceCriterion = {
  score: number
  explanation: string
  citation: string
  issues: string[]
  metrics: PerformanceMetrics
}

export const PERFORMANCE_CITATION =
  "Core Web Vitals thresholds, web.dev/vitals (Google, official)"

// Google's published Core Web Vitals bands — good / needs-improvement / poor.
const LCP_GOOD_MS = 2_500
const LCP_POOR_MS = 4_000
const TTFB_GOOD_MS = 800
const TTFB_POOR_MS = 1_800
const LOAD_GOOD_MS = 3_000
const LOAD_POOR_MS = 6_000

function band(value: number, good: number, poor: number): number {
  return value <= good ? 100 : value <= poor ? 60 : 20
}

function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}


export function scorePerformance(metrics: PerformanceMetrics): PerformanceCriterion {
  const lcpScore = band(metrics.lcp, LCP_GOOD_MS, LCP_POOR_MS)
  const ttfbScore = band(metrics.ttfb, TTFB_GOOD_MS, TTFB_POOR_MS)
  const loadScore = band(metrics.loadComplete, LOAD_GOOD_MS, LOAD_POOR_MS)

  const score = Math.round((lcpScore + ttfbScore + loadScore) / 3)

  const issues: string[] = []
  if (lcpScore < 100) {
    issues.push(
      `Largest Contentful Paint is ${formatMs(metrics.lcp)} — Google considers under ${formatMs(LCP_GOOD_MS)} good.`,
    )
  }
  if (ttfbScore < 100) {
    issues.push(
      `Time to First Byte is ${formatMs(metrics.ttfb)} — under ${formatMs(TTFB_GOOD_MS)} is the target.`,
    )
  }
  if (loadScore < 100) {
    issues.push(
      `Full page load takes ${formatMs(metrics.loadComplete)} — under ${formatMs(LOAD_GOOD_MS)} is the target.`,
    )
  }

  return {
    score,
    explanation:
      `LCP ${formatMs(metrics.lcp)}, TTFB ${formatMs(metrics.ttfb)}, ` +
      `full load ${formatMs(metrics.loadComplete)}. Scored against Google's Core Web Vitals bands.`,
    citation: PERFORMANCE_CITATION,
    issues,
    metrics,
  }
}
