import { IN_FLIGHT, type Deps } from "@/deps.js";
import { log, metric } from "@/lib/logger.js";
import { failDeployment } from "@/pipeline/lifecycle.js";

export async function reapStuckDeployments(deps: Deps, now = new Date()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - deps.config.reaperStuckMinutes * 60_000);
  const stuck = await deps.db.deployment.findMany({
    where: { status: { in: [...IN_FLIGHT] }, updatedAt: { lt: cutoff } },
    select: { id: true },
    take: 100,
  });
  const reaped: string[] = [];
  for (const { id } of stuck) {
    const failed = await failDeployment(deps, id, "The deployment took too long and was stopped.", {
      resyncKv: true,
    });
    if (failed) reaped.push(id);
  }
  if (reaped.length) {
    metric("deploy.reaper_activations", reaped.length);
    log.warn("reaped stuck deployments", { deploymentIds: reaped });
  }
  return reaped;
}
