import { redis } from "@/lib/redis.js"

const IP_WINDOW_SECONDS = 24 * 60 * 60 // 24h — IP changes naturally (mobile networks, coffee shops)
const DEVICE_WINDOW_SECONDS = 7 * 24 * 60 * 60 // 7d — device reuse is a stronger, longer-lived abuse signal than IP

export type VelocityCounts = {
    ipCount: number
    deviceCount: number
}

// Increments and returns rolling signup counters for this IP (and device
// fingerprint, if provided). Called once per completed signup (a User row
// actually being created) — not per attempt — so retries/failed signups
// don't inflate the count.
export async function recordAndCheckVelocity(ip: string, deviceFingerprint?: string): Promise<VelocityCounts> {
    const ipKey = `signup_velocity:ip:${ip}`
    const ipCount = await redis.incr(ipKey)
    if (ipCount === 1) await redis.expire(ipKey, IP_WINDOW_SECONDS)

    let deviceCount = 0
    if (deviceFingerprint) {
        const deviceKey = `signup_velocity:device:${deviceFingerprint}`
        deviceCount = await redis.incr(deviceKey)
        if (deviceCount === 1) await redis.expire(deviceKey, DEVICE_WINDOW_SECONDS)
    }

    return { ipCount, deviceCount }
}
