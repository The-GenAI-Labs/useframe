import { randomUUID } from "node:crypto";
import type { Deps } from "@/deps.js";
import { acquireLock, projectLockKey, releaseLock } from "@/lib/locks.js";
import { log, metric } from "@/lib/logger.js";
import { probeDeployment } from "@/pipeline/probe.js";
import { syncSiteToKvs } from "@/site/sync.js";
import { getDeployment } from "./deployments.js";
import { HttpError } from "./httpError.js";

// No build, no upload, no credit: point KV back at an older immutable prefix.
export async function rollback(deps: Deps, projectId: string, targetId: string) {
  const site = await deps.db.projectSite.findUnique({
    where: { projectId },
    select: { id: true, primaryHost: true, activeDeploymentId: true, suspendedAt: true },
  });
  if (!site) throw new HttpError(404, "This project has no site yet");
  if (site.suspendedAt) throw new HttpError(403, "This site has been suspended.");

  const target = await deps.db.deployment.findFirst({
    where: { id: targetId, projectId },
    select: { id: true, status: true, purgedAt: true, storagePrefix: true },
  });
  if (!target) throw new HttpError(404, "Deployment not found");
  if (target.status !== "SUPERSEDED" || target.purgedAt || !target.storagePrefix) {
    throw new HttpError(409, "Only a previous, still-stored deployment can be restored.");
  }

  const lockKey = projectLockKey(projectId);
  const token = `rollback:${randomUUID()}`;
  if (!(await acquireLock(deps.redis, lockKey, token, 10 * 60_000))) {
    throw new HttpError(409, "A deployment is already in progress for this project.");
  }

  try {
    const replacedId = site.activeDeploymentId;
    await syncSiteToKvs(deps, site.id, { activeDeploymentId: target.id });
    const probe = await probeDeployment({
      url: `https://${site.primaryHost}/`,
      deploymentId: target.id,
      timeoutMs: deps.config.probeTimeoutMs,
      intervalMs: deps.config.probeIntervalMs,
      fetchImpl: deps.fetchImpl,
    });
    metric("deploy.rollback_probe_ms", probe.elapsedMs, { projectId, ok: probe.ok });

    if (!probe.ok) {
      await syncSiteToKvs(deps, site.id);
      throw new HttpError(504, "Rollback could not be verified; the current version is still live.");
    }

    const now = new Date();
    await deps.db.$transaction(async (tx) => {
      await tx.deployment.update({
        where: { id: target.id },
        data: { status: "LIVE", rolledBackFromId: replacedId },
      });
      if (replacedId) {
        await tx.deployment.updateMany({
          where: { id: replacedId, status: "LIVE" },
          data: { status: "ROLLED_BACK", rolledBackAt: now },
        });
      }
      await tx.projectSite.update({ where: { id: site.id }, data: { activeDeploymentId: target.id } });
    });
    log.info("rolled back", { projectId, to: target.id, from: replacedId });
    return getDeployment(deps, projectId, target.id);
  } finally {
    await releaseLock(deps.redis, lockKey, token);
  }
}
