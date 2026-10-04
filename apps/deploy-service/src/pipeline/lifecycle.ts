import { refundCredits, RefundRejectedError } from "@useframe/db";
import type { DeploymentStatus } from "@useframe/db";
import { IN_FLIGHT, type Deps } from "@/deps.js";
import { projectLockKey, releaseLock } from "@/lib/locks.js";
import { errorMessage, log, metric } from "@/lib/logger.js";
import { syncSiteToKvs } from "@/site/sync.js";

const MAX_BUILD_LOG = 64 * 1024;

export const tail = (text: string) => (text.length > MAX_BUILD_LOG ? text.slice(-MAX_BUILD_LOG) : text);

export async function transition(
  deps: Pick<Deps, "db">,
  id: string,
  from: DeploymentStatus[],
  data: { status: DeploymentStatus } & Record<string, unknown>,
): Promise<boolean> {
  const moved = await deps.db.deployment.updateMany({ where: { id, status: { in: from } }, data });
  return moved.count === 1;
}

export type FailOptions = { buildLog?: string; refund?: boolean; resyncKv?: boolean };

// Idempotent: only an in-flight deployment is failed, so a reaper/cancel race is harmless.
export async function failDeployment(
  deps: Deps,
  deploymentId: string,
  publicMessage: string,
  options: FailOptions = {},
): Promise<boolean> {
  const deployment = await deps.db.deployment.findUnique({
    where: { id: deploymentId },
    select: { projectId: true, userId: true, siteId: true, triggeredBy: true },
  });
  if (!deployment) return false;

  const moved = await deps.db.deployment.updateMany({
    where: { id: deploymentId, status: { in: [...IN_FLIGHT] } },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      failureReason: publicMessage,
      ...(options.buildLog !== undefined ? { buildLog: tail(options.buildLog) } : {}),
    },
  });
  if (moved.count === 0) return false;

  const site = deployment.siteId
    ? await deps.db.projectSite.findUnique({
        where: { id: deployment.siteId },
        select: { activeDeploymentId: true },
      })
    : null;
  const hasLive = !!site?.activeDeploymentId;

  await deps.db.project.updateMany({
    where: { id: deployment.projectId, status: "DEPLOYING" },
    data: { status: hasLive ? "LIVE" : "READY" },
  });
  await deps.db.pipelineState.updateMany({
    where: { projectId: deployment.projectId, deployStatus: "RUNNING" },
    data: { deployStatus: hasLive ? "APPROVED" : "PENDING" },
  });

  if (options.resyncKv && deployment.siteId) {
    await syncSiteToKvs(deps, deployment.siteId).catch((err) =>
      log.error("kv resync after failure failed", { deploymentId, error: errorMessage(err) }),
    );
  }

  await releaseLock(deps.redis, projectLockKey(deployment.projectId), deploymentId);

  if (options.refund !== false && deployment.triggeredBy === "user") {
    try {
      const refund = await refundCredits(deps.db, {
        userId: deployment.userId,
        refType: "DEPLOYMENT",
        refId: deploymentId,
        reason: "Deploy failed",
      });
      if (!refund.alreadyRefunded) metric("deploy.refund", 1, { deploymentId });
    } catch (err) {
      // No charge yet: the API refunds after it charges if it then sees FAILED.
      if (!(err instanceof RefundRejectedError)) throw err;
      log.info("refund skipped: no charge recorded yet", { deploymentId });
    }
  }

  metric("deploy.failed", 1, { deploymentId, projectId: deployment.projectId, reason: publicMessage });
  log.warn("deployment failed", { deploymentId, projectId: deployment.projectId, reason: publicMessage });
  return true;
}

export async function goLive(
  deps: Deps,
  deployment: { id: string; projectId: string; versionId: string; siteId: string },
  liveUrl: string,
  buildDurationMs: number,
): Promise<boolean> {
  return deps.db.$transaction(async (tx) => {
    const moved = await tx.deployment.updateMany({
      where: { id: deployment.id, status: "ACTIVATING" },
      data: { status: "LIVE", deployedAt: new Date(), liveUrl, buildDurationMs },
    });
    if (moved.count === 0) return false;
    await tx.deployment.updateMany({
      where: { projectId: deployment.projectId, status: "LIVE", id: { not: deployment.id } },
      data: { status: "SUPERSEDED" },
    });
    await tx.projectSite.update({
      where: { id: deployment.siteId },
      data: { activeDeploymentId: deployment.id },
    });
    await tx.project.update({ where: { id: deployment.projectId }, data: { status: "LIVE" } });
    await tx.pipelineState.updateMany({
      where: { projectId: deployment.projectId },
      data: { deployStatus: "APPROVED" },
    });
    await tx.generationOutcome.updateMany({
      where: { versionId: deployment.versionId },
      data: { deployed: true },
    });
    return true;
  });
}
