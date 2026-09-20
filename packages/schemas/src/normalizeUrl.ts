// Protocol-agnostic, comprehensive URL normalizer used by the Postgres
// caching layer (packages/db/src/cache/scanCache.ts) to dedupe scans/scores
// for the same effective page regardless of www/trailing-slash/tracking
// params/param-order. Expects a parseable URL (i.e. including a protocol) —
// callers with a bare domain (e.g. "example.com") must prepend "https://"
// themselves before calling this, matching the ad-hoc pattern already used
// elsewhere in the codebase (WebScoreView.tsx, SeoAuditView.tsx,
// deploy.processor.ts). This is a different, independent function from the
// private normalizeUrl in apps/worker/src/lib/crawler.ts (SEO-crawl dedup
// only, no www/query handling) — do not conflate the two.
export function normalizeUrl(rawUrl: string): string {
  const u = new URL(rawUrl)
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, "")
  u.pathname = u.pathname.replace(/\/$/, "") || "/"
  const strip = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "ref"]
  strip.forEach((p) => u.searchParams.delete(p))
  u.hash = ""
  const sortedParams = [...u.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))
  u.search = new URLSearchParams(sortedParams).toString()
  return `${u.hostname}${u.pathname}${u.search ? "?" + u.search : ""}`
}
