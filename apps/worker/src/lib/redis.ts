import IORedis from "ioredis"
import { env } from "@/config/env.js"

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  // Dev-only: Upstash's rediss:// cert chain fails Node's verification on this
  // machine. Not safe for production — revisit before deploying.
  tls: env.REDIS_URL.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
})
