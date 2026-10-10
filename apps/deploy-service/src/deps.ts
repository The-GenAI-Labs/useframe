import type { Queue } from "bullmq";
import type { DeployRunJobPayload } from "@repo/events";
import type { LockClient } from "@/lib/locks.js";
import type { R2 } from "@/lib/r2.js";
import type { Db } from "@/site/sync.js";
import type { Isolation } from "@/pipeline/build.js";
import type { DomainDeps } from "@/domains/deps.js";

export type KvClient = {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
  listKeys(prefix: string): Promise<string[]>;
  bulkPut(entries: { key: string; value: string }[]): Promise<void>;
  bulkDelete(keys: string[]): Promise<void>;
};

export type DeployConfig = {
  baseDomain: string;
  workDir: string;
  templatesRoot: string;
  isolation: Isolation;
  buildUid: number;
  buildGid: number;
  installTimeoutMs: number;
  buildTimeoutMs: number;
  probeTimeoutMs: number;
  probeIntervalMs: number;
  maxFiles: number;
  maxTotalBytes: number;
  retainCount: number;
  reaperStuckMinutes: number;
  enqueueValidation: boolean;
};

export type Deps = {
  db: Db;
  kv: KvClient;
  r2: R2;
  // Read-only client for the private media library; absent until configured.
  mediaSource?: R2 | null;
  redis: LockClient;
  runQueue: Pick<Queue<DeployRunJobPayload>, "add" | "getJob">;
  validationQueue?: Pick<Queue, "add">;
  /** Present only when custom domains are enabled and configured. */
  domains?: DomainDeps | null;
  config: DeployConfig;
  fetchImpl?: typeof fetch;
};

export const IN_FLIGHT = ["QUEUED", "BUILDING", "UPLOADING", "ACTIVATING"] as const;
export type InFlightStatus = (typeof IN_FLIGHT)[number];

export const projectLockTtlMs = (config: DeployConfig) => (config.reaperStuckMinutes + 10) * 60_000;
