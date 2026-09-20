export const SEO_CACHE_TTL_SECONDS = 43_200

export function seoCacheKey(domain: string, tier: "free" | "paid"): string {
  return `seo-audit:${domain}:${tier}`
}
