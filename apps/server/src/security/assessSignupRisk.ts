import { isDisposableEmail } from "./disposableEmail.js"
import { getIpRisk } from "./ipReputation.js"
import { recordAndCheckVelocity } from "./velocityCheck.js"

export type RiskDecision = "ALLOW" | "SUSPICIOUS" | "BLOCK_FREE_TIER"

export type SignupRiskResult = {
    decision: RiskDecision
    score: number
    reasons: string[]
}

// Composite signup risk score. Never blocks account creation itself (see
// the module-level note in auth.service.ts) — only ever read afterward by
// GenerateService.authorize() to decide whether the FREE generation grant
// is allowed. BLOCK_FREE_TIER still lets someone pay for generation with
// credits; it just withholds the free one.
export async function assessSignupRisk(params: {
    email: string
    ip: string
    deviceFingerprint?: string
}): Promise<SignupRiskResult> {
    let score = 0
    const reasons: string[] = []

    if (isDisposableEmail(params.email)) {
        score += 50
        reasons.push("disposable_email")
    }

    const ipRisk = await getIpRisk(params.ip)
    if (ipRisk.isVpnOrProxy) {
        score += 25
        reasons.push("vpn_or_proxy")
    }
    if (ipRisk.isDatacenter) {
        score += 25
        reasons.push("datacenter_ip")
    }
    score += ipRisk.score * 0.15

    const { ipCount, deviceCount } = await recordAndCheckVelocity(params.ip, params.deviceFingerprint)
    if (ipCount >= 3) {
        score += 35
        reasons.push("ip_signup_velocity")
    }
    // ANY prior signup from this exact device is highly suspicious for
    // free-tier farming specifically (the "1@gmail.com to 10@gmail.com"
    // scenario) — deviceCount is 1 on the FIRST signup from a device (the
    // redis INCR that just ran), so >= 2 is what actually means "reused."
    if (deviceCount >= 2) {
        score += 60
        reasons.push("device_reused")
    }

    const decision: RiskDecision = score >= 80 ? "BLOCK_FREE_TIER" : score >= 40 ? "SUSPICIOUS" : "ALLOW"

    return { decision, score: Math.round(score), reasons }
}
