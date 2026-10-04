import { randomUUID } from "node:crypto";
import type { DeployTrigger } from "@repo/events";
import { IN_FLIGHT, projectLockTtlMs, type Deps } from "@/deps.js";
import { acquireLock, projectLockKey, releaseLock, swapLockToken } from "@/lib/locks.js";
import { errorMessage, log, metric } from "@/lib/logger.js";
import { failDeployment } from "@/pipeline/lifecycle.js";
import { ensureSite } from "@/site/ensureSite.js";
import { HttpError } from "./httpError.js";

export type CreateDeploymentInput = {
  projectId: string;
  versionId: string;
  userId: string;
  triggeredBy: DeployTrigger;
};

const DEPLOYMENT_VIEW = {
  id: true,
  projectId: true,
  versionId: true,
  status: true,
  triggeredBy: true,
  subdomain: true,
  liveUrl: true,
  failureReason: true,
  buildDurationMs: true,
  framework: true,
  fileCount: true,
  totalBytes: true,
  createdAt: true,
  deployedAt: true,
  failedAt: true,
  rolledBackAt: true,
  purgedAt: true,
} as const;

type DeploymentRow = {
  totalBytes: bigint | null;
  [key: string]: unknown;
};

export function toView<T extends DeploymentRow>(row: T) {
  return { ...row, totalBytes: row.totalBytes === null ? null : Number(row.totalBytes) };
}

export async function createDeployment(deps: Deps, input: CreateDeploymentInput) {
  const project = await deps.db.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
    select: { id: true, userId: true },
  });
  if (!project) throw new HttpError(404, "Project not found");
  if (project.userId !== input.userId) throw new HttpError(403, "Project does not belong to this user");

  const version = await deps.db.projectVersion.findFirst({
    where: { id: input.versionId, projectId: project.id },
    select: { id: true },
  });
  if (!version) throw new HttpError(404, "Version not found");

  const site = await ensureSite(deps.db, project.id, deps.config.baseDomain);
  if (site.suspendedAt) throw new HttpError(403, "This site has been suspended.");

  const lockKey = projectLockKey(project.id);
  const token = `pending:${randomUUID()}`;
  if (!(await acquireLock(deps.redis, lockKey, token, projectLockTtlMs(deps.config)))) {
    throw new HttpError(409, "A deployment is already in progress for this project.");
  }

  let deploymentId: string | undefined;
  try {
    const inFlight = await deps.db.deployment.findFirst({
      where: { projectId: project.id, status: { in: [...IN_FLIGHT] } },
      select: { id: true },
    });
    if (inFlight) throw new HttpError(409, "A deployment is already in progress for this project.");

    const deployment = await deps.db.deployment.create({
      data: {
        projectId: project.id,
        versionId: version.id,
        userId: input.userId,
        siteId: site.id,
        subdomain: site.defaultHost,
        siteUrl: `https://${site.primaryHost}`,
        triggeredBy: input.triggeredBy,
        status: "QUEUED",
      },
      select: { id: true },
    });
    deploymentId = deployment.id;
    await swapLockToken(deps.redis, lockKey, token, deployment.id);

    await deps.db.project.update({ where: { id: project.id }, data: { status: "DEPLOYING" } });
    await deps.db.pipelineState.updateMany({
      where: { projectId: project.id },
      data: { deployStatus: "RUNNING" },
    });

    await deps.runQueue.add(
      "deploy",
      {
        deploymentId: deployment.id,
        projectId: project.id,
        versionId: version.id,
        userId: input.userId,
        siteId: site.id,
        triggeredBy: input.triggeredBy,
      },
      { jobId: deployment.id, attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 },
    );
  } catch (err) {
    if (deploymentId) {
      await failDeployment(deps, deploymentId, "The deployment could not be queued.", { refund: false });
      log.error("enqueue failed", { deploymentId, error: errorMessage(err) });
      throw new HttpError(503, "The deployment could not be queued. Please retry.");
    }
    await releaseLock(deps.redis, lockKey, token);
    throw err;
  }

  metric("deploy.started", 1, { deploymentId, projectId: project.id, triggeredBy: input.triggeredBy });
  return { deploymentId, status: "QUEUED" as const, host: site.primaryHost };
}

// Used by the API when the credit charge fails after a 202: no refund is due.
export async function cancelDeployment(deps: Deps, projectId: string, deploymentId: string) {
  const deployment = await deps.db.deployment.findFirst({
    where: { id: deploymentId, projectId },
    select: { id: true },
  });
  if (!deployment) throw new HttpError(404, "Deployment not found");
  const job = await deps.runQueue.getJob(deploymentId);
  if (job && (await job.isWaiting())) await job.remove().catch(() => undefined);
  await failDeployment(deps, deploymentId, "The deployment was cancelled because the charge failed.", {
    refund: false,
    resyncKv: true,
  });
  return getDeployment(deps, projectId, deploymentId);
}

export async function getDeployment(deps: Pick<Deps, "db">, projectId: string, deploymentId: string) {
  const row = await deps.db.deployment.findFirst({
    where: { id: deploymentId, projectId },
    select: DEPLOYMENT_VIEW,
  });
  if (!row) throw new HttpError(404, "Deployment not found");
  return toView(row);
}

export async function findDeployment(deps: Pick<Deps, "db">, deploymentId: string) {
  const row = await deps.db.deployment.findUnique({ where: { id: deploymentId }, select: DEPLOYMENT_VIEW });
  if (!row) throw new HttpError(404, "Deployment not found");
  return toView(row);
}

export async function listDeployments(deps: Pick<Deps, "db">, projectId: string, limit = 50) {
  const rows = await deps.db.deployment.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
    select: DEPLOYMENT_VIEW,
  });
  return rows.map(toView);
}

export async function getSite(deps: Pick<Deps, "db">, projectId: string) {
  const site = await deps.db.projectSite.findUnique({
    where: { projectId },
    select: {
      subdomainLabel: true,
      defaultHost: true,
      primaryHost: true,
      activeDeploymentId: true,
      suspendedAt: true,
      suspendedReason: true,
    },
  });
  if (!site) return null;
  const activeDeployment = site.activeDeploymentId
    ? await deps.db.deployment.findUnique({ where: { id: site.activeDeploymentId }, select: DEPLOYMENT_VIEW })
    : null;
  return {
    subdomainLabel: site.subdomainLabel,
    defaultHost: site.defaultHost,
    primaryHost: site.primaryHost,
    liveUrl: `https://${site.primaryHost}`,
    suspended: site.suspendedAt !== null,
    suspendedReason: site.suspendedReason,
    activeDeployment: activeDeployment ? toView(activeDeployment) : null,
  };
}
