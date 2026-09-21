import { env } from "@/config/env.js"
import { redis } from "@/lib/redis.js"

const CACHE_TTL_SECONDS = 6 * 60 * 60 // a few hours — no need to re-query the same IP repeatedly in a short window

export type IpRisk = {
    isVpnOrProxy: boolean
    isDatacenter: boolean
    score: number // 0-100, IPQualityScore's fraud_score
}

const NEUTRAL_RISK: IpRisk = { isVpnOrProxy: false, isDatacenter: false, score: 0 }

type IpqsResponse = {
    vpn?: boolean
    proxy?: boolean
    tor?: boolean
    connection_type?: string
    fraud_score?: number
}

// Best-effort IP reputation lookup via IPQualityScore. Returns a neutral
// (zero-risk) result — never throws — if the key isn't configured or the
// API call fails, since this is one enrichment signal among several in
// assessSignupRisk, not something worth failing signup over.
export async function getIpRisk(ip: string): Promise<IpRisk> {
    if (!env.IPQS_API_KEY || !ip || ip === "unknown") return NEUTRAL_RISK

    const cacheKey = `ip_risk:${ip}`
    const cached = await redis.get(cacheKey).catch(() => null)
    if (cached) {
        try {
            return JSON.parse(cached) as IpRisk
        } catch {
            // fall through to a fresh lookup on a corrupt cache entry
        }
    }

    let risk: IpRisk
    try {
        const res = await fetch(
            `https://ipqualityscore.com/api/json/ip/${env.IPQS_API_KEY}/${encodeURIComponent(ip)}`
        )
        if (!res.ok) return NEUTRAL_RISK

        const body = (await res.json()) as IpqsResponse
        risk = {
            isVpnOrProxy: !!(body.vpn || body.proxy || body.tor),
            isDatacenter: body.connection_type === "Data Center",
            score: body.fraud_score ?? 0,
        }
    } catch (err) {
        console.warn("[ipReputation] lookup failed:", err instanceof Error ? err.message : err)
        return NEUTRAL_RISK
    }

    await redis.set(cacheKey, JSON.stringify(risk), "EX", CACHE_TTL_SECONDS).catch(() => {})
    return risk
}
