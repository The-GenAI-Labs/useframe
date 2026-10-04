import type { prisma as Prisma } from "@useframe/db";
import type { LockClient } from "@/lib/locks.js";
import { siteKvLockKey, withLock } from "@/lib/locks.js";
import { log } from "@/lib/logger.js";
import { computeDesiredEntries, orderWrites, type DesiredEntries, type SiteState } from "./desired.js";
import { kvKeyForHost, serializeValue } from "./kvContract.js";

export type Db = typeof Prisma;

export type KvWriter = {
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export type SyncDeps = { db: Db; kv: KvWriter; redis: LockClient };

export type SyncOptions = {
  // undefined = use the DB value; a string/null computes state "as if" that were active.
  activeDeploymentId?: string | null;
  deleteHosts?: string[];
  // Project deletion: remove every host the site owns.
  remove?: boolean;
};

const modeFor = (framework: string | null): "n" | "s" => (framework === "NEXT_EXPORT" ? "n" : "s");

export async function loadSiteState(
  db: Db,
  siteId: string,
  activeOverride?: string | null,
): Promise<SiteState> {
  const site = await db.projectSite.findUniqueOrThrow({
    where: { id: siteId },
    select: {
      projectId: true,
      defaultHost: true,
      primaryHost: true,
      suspendedAt: true,
      activeDeploymentId: true,
    },
  });
  const activeId = activeOverride !== undefined ? activeOverride : site.activeDeploymentId;
  const deployment = activeId
    ? await db.deployment.findFirst({
        where: { id: activeId, projectId: site.projectId },
        select: { id: true, framework: true },
      })
    : null;
  return {
    defaultHost: site.defaultHost,
    primaryHost: site.primaryHost,
    suspended: site.suspendedAt !== null,
    active: deployment
      ? { projectId: site.projectId, deploymentId: deployment.id, mode: modeFor(deployment.framework) }
      : null,
  };
}

export async function applyEntries(kv: KvWriter, entries: DesiredEntries): Promise<void> {
  const plan = orderWrites(entries);
  const puts = plan.puts.map(([host, value]) => [kvKeyForHost(host), serializeValue(value)] as const);
  const deletes = plan.deletes.map(kvKeyForHost);
  for (const [key, value] of puts) await kv.put(key, value);
  for (const key of deletes) await kv.delete(key);
}

// The only code allowed to write site entries to KV. DB is the source of truth.
export async function syncSiteToKvs(
  deps: SyncDeps,
  siteId: string,
  options: SyncOptions = {},
): Promise<DesiredEntries> {
  return withLock(deps.redis, siteKvLockKey(siteId), 60_000, 60_000, async () => {
    const state = await loadSiteState(deps.db, siteId, options.activeDeploymentId);
    const entries = options.remove
      ? new Map([state.defaultHost, state.primaryHost].map((h) => [h.toLowerCase(), null] as const))
      : computeDesiredEntries(state, options.deleteHosts);
    await applyEntries(deps.kv, entries);
    log.info("kv sync", { siteId, hosts: [...entries.keys()] });
    return entries;
  });
}

export type BulkKvWriter = {
  bulkPut(entries: { key: string; value: string }[]): Promise<void>;
  bulkDelete(keys: string[]): Promise<void>;
};

// Used only by reconcile, which diffs the whole namespace against the DB.
export async function applyBulk(
  kv: BulkKvWriter,
  puts: Map<string, string>,
  deletes: string[],
): Promise<void> {
  if (puts.size) await kv.bulkPut([...puts].map(([key, value]) => ({ key, value })));
  if (deletes.length) await kv.bulkDelete(deletes);
}
