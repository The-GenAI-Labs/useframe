import type { Deps } from "@/deps.js";
import { log, metric } from "@/lib/logger.js";
import { computeDesiredEntries, SERVING_DOMAIN_STATUSES } from "@/site/desired.js";
import { kvKeyForHost, serializeValue } from "@/site/kvContract.js";
import { applyBulk } from "@/site/sync.js";

export type ReconcileOptions = {
  apply: boolean;
  rewriteValues?: boolean;
  force?: boolean;
  scheduled?: boolean;
  sampleSize?: number;
};

export type ReconcileReport = {
  desired: number;
  existing: number;
  missing: number;
  extra: number;
  mismatched: number;
  applied: boolean;
  capTripped: boolean;
};

export function diffKeys(desired: Map<string, string>, existing: string[]) {
  const existingSet = new Set(existing);
  const missing = [...desired.keys()].filter((k) => !existingSet.has(k));
  const extra = existing.filter((k) => !desired.has(k));
  return { missing, extra };
}

// 5% of keys, with a small floor so a tiny fleet can still self-heal one key.
export function exceedsSafetyCap(changes: number, total: number): boolean {
  return changes > Math.max(5, Math.ceil(total * 0.05));
}

export async function buildDesiredMap(deps: Pick<Deps, "db">): Promise<Map<string, string>> {
  const desired = new Map<string, string>();
  let cursor: string | undefined;
  for (;;) {
    const sites = await deps.db.projectSite.findMany({
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        projectId: true,
        defaultHost: true,
        primaryHost: true,
        suspendedAt: true,
        activeDeploymentId: true,
      },
    });
    if (sites.length === 0) break;
    cursor = sites[sites.length - 1]!.id;

    const activeIds = sites.flatMap((s) => (s.activeDeploymentId ? [s.activeDeploymentId] : []));
    const deployments = await deps.db.deployment.findMany({
      where: { id: { in: activeIds } },
      select: { id: true, projectId: true, framework: true },
    });
    const byId = new Map(deployments.map((d) => [d.id, d]));
    const domains = await deps.db.customDomain.findMany({
      where: { projectId: { in: sites.map((s) => s.projectId) }, status: { in: [...SERVING_DOMAIN_STATUSES] } },
      select: { projectId: true, domain: true },
    });
    const domainByProject = new Map(domains.map((d) => [d.projectId, d.domain]));

    for (const site of sites) {
      const active = site.activeDeploymentId ? byId.get(site.activeDeploymentId) : undefined;
      const entries = computeDesiredEntries({
        defaultHost: site.defaultHost,
        primaryHost: site.primaryHost,
        suspended: site.suspendedAt !== null,
        extraServeHosts: domainByProject.has(site.projectId) ? [domainByProject.get(site.projectId)!] : [],
        active:
          active && active.projectId === site.projectId
            ? { projectId: site.projectId, deploymentId: active.id, mode: active.framework === "NEXT_EXPORT" ? "n" : "s" }
            : null,
      });
      for (const [host, value] of entries) {
        if (value) desired.set(kvKeyForHost(host), serializeValue(value));
      }
    }
  }
  return desired;
}

function sample<T>(items: T[], size: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, size);
}

export async function reconcile(deps: Deps, options: ReconcileOptions): Promise<ReconcileReport> {
  const desired = await buildDesiredMap(deps);
  const existing = await deps.kv.listKeys("h:");
  const { missing, extra } = diffKeys(desired, existing);

  const mismatchedKeys: string[] = [];
  if (options.scheduled || options.sampleSize) {
    const present = sample(
      [...desired.keys()].filter((k) => existing.includes(k)),
      options.sampleSize ?? 50,
    );
    for (const key of present) {
      if ((await deps.kv.get(key)) !== desired.get(key)) mismatchedKeys.push(key);
    }
  }

  const total = Math.max(desired.size, existing.length);
  const capTripped = exceedsSafetyCap(missing.length + extra.length, total);
  const report: ReconcileReport = {
    desired: desired.size,
    existing: existing.length,
    missing: missing.length,
    extra: extra.length,
    mismatched: mismatchedKeys.length,
    applied: false,
    capTripped,
  };

  metric("deploy.kv_key_count", existing.length);
  metric("deploy.reconcile_diff", missing.length + extra.length + mismatchedKeys.length, {
    missing: missing.length,
    extra: extra.length,
    mismatched: mismatchedKeys.length,
  });

  if (!options.apply) return report;
  if (capTripped && (options.scheduled || !options.force)) {
    log.error("ALERT: kv reconcile safety cap tripped; nothing applied", { ...report });
    metric("deploy.reconcile_cap_tripped", 1);
    return report;
  }

  const puts = new Map<string, string>();
  const toWrite = options.rewriteValues ? [...desired.keys()] : [...missing, ...mismatchedKeys];
  for (const key of toWrite) puts.set(key, desired.get(key)!);
  await applyBulk(deps.kv, puts, extra);
  report.applied = true;
  log.info("kv reconcile applied", { ...report, written: puts.size, deleted: extra.length });
  return report;
}
