import type { Page } from "playwright"

export type PerformanceMetrics = {
  ttfb: number
  domContentLoaded: number
  loadComplete: number
  lcp: number
}

const LCP_TIMEOUT_MS = 3_000

// Real measured navigation timing from the already-loaded page — no LLM, no
// second page load, no synthetic Lighthouse run. Returns null if the page
// doesn't expose navigation timing (rare, but possible on some error pages),
// so callers can omit the criterion rather than score a guess as if measured.
export async function measurePerformance(page: Page): Promise<PerformanceMetrics | null> {
  try {
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined
      if (!nav) return null
      return {
        ttfb: nav.responseStart - nav.requestStart,
        domContentLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        loadComplete: nav.loadEventEnd - nav.startTime,
      }
    })

    if (!timing) return null

    const lcp = await page.evaluate(
      (timeoutMs) =>
        new Promise<number>((resolve) => {
          try {
            // buffered:true replays entries already recorded before this
            // observer attached — without it, LCP on an
            // already-settled page would never fire.
            new PerformanceObserver((list) => {
              const entries = list.getEntries()
              resolve(entries[entries.length - 1]?.startTime ?? 0)
            }).observe({ type: "largest-contentful-paint", buffered: true })
          } catch {
            resolve(0) // browser without LCP support
          }
          setTimeout(() => resolve(0), timeoutMs)
        }),
      LCP_TIMEOUT_MS,
    )

    return { ...timing, lcp }
  } catch {
    return null
  }
}
