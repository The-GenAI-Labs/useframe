import { IN_FLIGHT, type Deps } from "@/deps.js";
import { log } from "@/lib/logger.js";
import { deletePrefix } from "@/lib/r2.js";
import { teardownProjectDomain } from "@/domains/service.js";
import { failDeployment } from "@/pipeline/lifecycle.js";
import { syncSiteToKvs } from "@/site/sync.js";
import { HttpError } from "./httpError.js";

export async function setSuspended(deps: Deps, projectId: string, reason: string | null) {
  const site = await deps.db.projectSite.findUnique({ where: { projectId }, select: { id: true } });
  if (!site) throw new HttpError(404, "This project has no site");
  await deps.db.projectSite.update({
    where: { id: site.id },
    data: reason === null ? { suspendedAt: null, suspendedReason: null } : { suspendedAt: new Date(), suspendedReason: reason },
  });
  await syncSiteToKvs(deps, site.id);
  log.warn(reason === null ? "site unsuspended" : "site suspended", { projectId, reason });
}

// Project deletion hook: KV entries, every stored build, then the site row.
export async function removeSite(deps: Deps, projectId: string) {
  const site = await deps.db.projectSite.findUnique({ where: { projectId }, select: { id: true } });
  if (!site) return { removed: false };

  const inFlight = await deps.db.deployment.findMany({
    where: { projectId, status: { in: [...IN_FLIGHT] } },
    select: { id: true },
  });
  for (const d of inFlight) await failDeployment(deps, d.id, "The project was deleted.");
  if (deps.domains) await teardownProjectDomain(deps.domains, projectId);

  await syncSiteToKvs(deps, site.id, { remove: true });
  await deletePrefix(deps.r2, `sites/${projectId}/`);
  await deps.db.deployment.updateMany({
    where: { projectId, purgedAt: null, storagePrefix: { not: null } },
    data: { purgedAt: new Date() },
  });
  await deps.db.projectSite.delete({ where: { id: site.id } });
  log.info("site removed", { projectId });
  return { removed: true };
}
