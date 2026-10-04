import { IN_FLIGHT, type Deps } from "@/deps.js";
import { log, metric } from "@/lib/logger.js";
import { deletePrefix } from "@/lib/r2.js";
import { storagePrefixFor } from "@/pipeline/upload.js";

export type GcCandidate = { id: string; status: string; storagePrefix: string | null };

// Input is newest first. Keeps the live deployment, anything in flight, and the
// `retain` most recent others.
export function selectForPurge(
  deployments: GcCandidate[],
  activeId: string | null,
  retain: number,
): GcCandidate[] {
  const inFlight = new Set<string>(IN_FLIGHT);
  let kept = 0;
  const purge: GcCandidate[] = [];
  for (const d of deployments) {
    if (d.id === activeId || inFlight.has(d.status) || !d.storagePrefix) continue;
    if (kept < retain) {
      kept++;
      continue;
    }
    purge.push(d);
  }
  return purge;
}

export async function runGc(deps: Deps, options: { dryRun: boolean }): Promise<{ purged: string[] }> {
  const purged: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const sites = await deps.db.projectSite.findMany({
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, projectId: true, activeDeploymentId: true },
    });
    if (sites.length === 0) break;
    cursor = sites[sites.length - 1]!.id;

    for (const site of sites) {
      const deployments = await deps.db.deployment.findMany({
        where: { projectId: site.projectId, purgedAt: null, storagePrefix: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, storagePrefix: true },
      });
      for (const d of selectForPurge(deployments, site.activeDeploymentId, deps.config.retainCount)) {
        // Never trust a stored prefix blindly: it must be exactly this deployment's.
        if (d.storagePrefix !== storagePrefixFor(site.projectId, d.id)) {
          log.error("gc skipped unexpected prefix", { deploymentId: d.id, prefix: d.storagePrefix });
          continue;
        }
        if (!options.dryRun) {
          await deletePrefix(deps.r2, d.storagePrefix);
          await deps.db.deployment.update({ where: { id: d.id }, data: { purgedAt: new Date() } });
        }
        purged.push(d.id);
      }
    }
  }
  metric("deploy.gc_purged", purged.length, { dryRun: options.dryRun });
  log.info("gc finished", { dryRun: options.dryRun, purged: purged.length });
  return { purged };
}
