import { Redis } from "ioredis";
import { env } from "../config/env.js";
let client: Redis | undefined;
let connection: Promise<void> | undefined;
export async function getRedis(): Promise<Redis | undefined> {
  if (!env.REDIS_URL) return undefined;
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
      maxRetriesPerRequest: 0,
      connectTimeout: 1000,
      commandTimeout: 500,
    });
    client.on("error", () => {});
    connection = client.connect();
  }
  await connection;
  return client;
}
export function closeRedis() {
  client?.disconnect();
}
