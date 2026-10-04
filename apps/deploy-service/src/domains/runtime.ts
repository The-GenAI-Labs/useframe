import { randomBytes } from "node:crypto";
import type { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type { DomainTickJobPayload } from "@repo/events";
import type { DomainScratch } from "./deps.js";
import type { Observation } from "./instructions.js";

const OBSERVATION_TTL_S = 7 * 24 * 60 * 60;
const currentKey = (domainId: string) => `deploy:domain:tick:${domainId}`;

export function createRedisScratch(redis: Redis): DomainScratch {
  return {
    async getObservation(domainId) {
      const raw = await redis.get(`deploy:domain:obs:${domainId}`);
      return raw ? (JSON.parse(raw) as Observation) : null;
    },
    async setObservation(domainId, observation) {
      await redis.set(`deploy:domain:obs:${domainId}`, JSON.stringify(observation), "EX", OBSERVATION_TTL_S);
    },
    async claim(key, ttlSeconds) {
      return (await redis.set(`deploy:domain:${key}`, "1", "EX", ttlSeconds, "NX")) === "OK";
    },
    async incr(key, ttlSeconds) {
      const count = await redis.incr(`deploy:domain:${key}`);
      await redis.expire(`deploy:domain:${key}`, ttlSeconds);
      return count;
    },
    async clear(key) {
      await redis.del(`deploy:domain:${key}`);
    },
  };
}

// One live tick chain per domain: each schedule replaces the previous delayed job
// and records its id; a tick whose id is no longer current exits without rescheduling.
export function createTickScheduler(queue: Queue<DomainTickJobPayload>, redis: Redis) {
  return {
    async schedule(domainId: string, delayMs: number): Promise<void> {
      const jobId = `domain-${domainId}-${Date.now()}-${randomBytes(3).toString("hex")}`;
      const previous = await redis.getset(currentKey(domainId), jobId);
      if (previous) {
        const job = await queue.getJob(previous);
        if (job && ((await job.isDelayed()) || (await job.isWaiting()))) await job.remove().catch(() => undefined);
      }
      await queue.add(
        "tick",
        { domainId },
        { jobId, delay: Math.max(0, delayMs), removeOnComplete: 100, removeOnFail: 100 },
      );
    },
    async isCurrent(domainId: string, jobId: string | undefined): Promise<boolean> {
      return !!jobId && (await redis.get(currentKey(domainId))) === jobId;
    },
  };
}
