import { randomUUID } from "node:crypto"
import type { Redis } from "ioredis"

export interface Semaphore {
  run<T>(fn: () => Promise<T>): Promise<T>
}

const ACQUIRE = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", ARGV[1])
if redis.call("ZCARD", KEYS[1]) < tonumber(ARGV[3]) then
  redis.call("ZADD", KEYS[1], ARGV[2], ARGV[4])
  return 1
end
return 0`

// Global across worker replicas: each holder keeps a lease that expires on its own if the process dies.
export function redisSemaphore(redis: Redis, name: string, limit: number, leaseMs = 20 * 60_000): Semaphore {
  const key = `media:sem:${name}`
  return {
    async run(fn) {
      const token = randomUUID()
      let wait = 500
      for (;;) {
        const now = Date.now()
        const ok = await redis.eval(ACQUIRE, 1, key, String(now), String(now + leaseMs), String(limit), token)
        if (ok === 1) break
        await new Promise((r) => setTimeout(r, wait))
        wait = Math.min(wait * 1.5, 5000)
      }
      const renew = setInterval(() => void redis.zadd(key, String(Date.now() + leaseMs), token).catch(() => undefined), leaseMs / 3)
      try {
        return await fn()
      } finally {
        clearInterval(renew)
        await redis.zrem(key, token).catch(() => undefined)
      }
    },
  }
}

export function localSemaphore(limit: number): Semaphore & { peak: number } {
  let active = 0
  const queue: (() => void)[] = []
  const sem = {
    peak: 0,
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (active >= limit) await new Promise<void>((r) => queue.push(r))
      active++
      sem.peak = Math.max(sem.peak, active)
      try {
        return await fn()
      } finally {
        active--
        queue.shift()?.()
      }
    },
  }
  return sem
}

// One runner per media job at a time.
export async function withJobLock<T>(redis: Redis, jobId: string, fn: () => Promise<T>): Promise<T | null> {
  const key = `media:job-lock:${jobId}`
  const token = randomUUID()
  if ((await redis.set(key, token, "PX", 15 * 60_000, "NX")) !== "OK") return null
  const renew = setInterval(() => void redis.pexpire(key, 15 * 60_000).catch(() => undefined), 5 * 60_000)
  try {
    return await fn()
  } finally {
    clearInterval(renew)
    const current = await redis.get(key).catch(() => null)
    if (current === token) await redis.del(key).catch(() => undefined)
  }
}
