import { Redis as IORedis } from "ioredis";
import { env } from "@/config/env.js";

export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  // Matches the other services: Upstash's rediss:// chain fails verification on dev machines.
  tls: env.REDIS_URL.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
});
