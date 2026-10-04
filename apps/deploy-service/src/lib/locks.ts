import type { Redis } from "ioredis";
import { sleep } from "./retry.js";

export type LockClient = Pick<Redis, "set" | "eval" | "get">;

const RELEASE_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export const projectLockKey = (projectId: string) => `deploy:project:${projectId}`;
export const siteKvLockKey = (siteId: string) => `deploy:kv:site:${siteId}`;

export async function acquireLock(
  redis: LockClient,
  key: string,
  token: string,
  ttlMs: number,
): Promise<boolean> {
  return (await redis.set(key, token, "PX", ttlMs, "NX")) === "OK";
}

const SWAP_SCRIPT = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("set", KEYS[1], ARGV[2], "KEEPTTL") else return nil end`;

// Re-keys a held lock to a new token (e.g. the deployment id once the row exists).
export async function swapLockToken(
  redis: LockClient,
  key: string,
  from: string,
  to: string,
): Promise<boolean> {
  return (await redis.eval(SWAP_SCRIPT, 1, key, from, to)) === "OK";
}

export async function releaseLock(redis: LockClient, key: string, token: string): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, 1, key, token);
}

export async function withLock<T>(
  redis: LockClient,
  key: string,
  ttlMs: number,
  waitMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + waitMs;
  while (!(await acquireLock(redis, key, token, ttlMs))) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for lock ${key}`);
    await sleep(200 + Math.random() * 300);
  }
  try {
    return await fn();
  } finally {
    await releaseLock(redis, key, token);
  }
}
