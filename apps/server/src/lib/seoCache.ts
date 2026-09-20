import { redis } from "@/lib/redis.js"

export const SEO_CACHE_TTL_SECONDS = 43_200

export function seoCacheKey(domain: string, tier: "free" | "paid"): string {
  return `seo-audit:${domain}:${tier}`
}

// TODO: call from future deploy/publish handler once QUEUES.DEPLOY is wired
export async function invalidateSeoCache(domain: string): Promise<void> {
  await redis.del(seoCacheKey(domain, "free"), seoCacheKey(domain, "paid"))
}
