import { env } from "@/config/env.js";
import { AppError } from "@/middleware/errorHandler.js";

export type DeploymentStatus =
  | "QUEUED"
  | "BUILDING"
  | "UPLOADING"
  | "DNS_PROVISIONING"
  | "ACTIVATING"
  | "LIVE"
  | "FAILED"
  | "ROLLED_BACK"
  | "SUPERSEDED";

export type DeploymentView = {
  id: string;
  projectId: string;
  versionId: string;
  status: DeploymentStatus;
  triggeredBy: string;
  subdomain: string;
  liveUrl: string | null;
  failureReason: string | null;
  buildDurationMs: number | null;
  framework: "NEXT_EXPORT" | "VITE_SPA" | null;
  fileCount: number | null;
  totalBytes: number | null;
  createdAt: string;
  deployedAt: string | null;
  failedAt: string | null;
  rolledBackAt: string | null;
  purgedAt: string | null;
};

export type SiteView = {
  subdomainLabel: string;
  defaultHost: string;
  primaryHost: string;
  liveUrl: string;
  suspended: boolean;
  suspendedReason: string | null;
  activeDeployment: DeploymentView | null;
};

async function deployFetch<T>(path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.DEPLOY_SERVICE_URL}${path}`, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "Content-Type": "application/json",
        ...(env.INTERNAL_SERVICE_SECRET ? { "x-internal-secret": env.INTERNAL_SERVICE_SECRET } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new AppError("Deploy service is unavailable", 503);
  }

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; message: string; code?: string }
    | null;

  if (!res.ok || !body?.success) {
    const message = body && "message" in body ? body.message : "Deploy service request failed";
    const code = body && "code" in body ? body.code : undefined;
    const status = res.status >= 400 && res.status < 500 ? res.status : res.status === 503 ? 503 : 502;
    throw new AppError(message, status, code);
  }
  return body.data;
}

const project = (projectId: string) => `/internal/projects/${encodeURIComponent(projectId)}`;

export function requestDeployment(input: {
  projectId: string;
  versionId: string;
  userId: string;
}): Promise<{ deploymentId: string; status: DeploymentStatus; host: string }> {
  return deployFetch("/internal/deployments", {
    method: "POST",
    body: JSON.stringify({ ...input, triggeredBy: "user" }),
  });
}

export function cancelDeployment(projectId: string, deploymentId: string): Promise<DeploymentView> {
  return deployFetch(`${project(projectId)}/deployments/${encodeURIComponent(deploymentId)}/cancel`, {
    method: "POST",
  });
}

export function getDeployment(projectId: string, deploymentId: string): Promise<DeploymentView> {
  return deployFetch(`${project(projectId)}/deployments/${encodeURIComponent(deploymentId)}`);
}

export function listDeployments(projectId: string): Promise<DeploymentView[]> {
  return deployFetch(`${project(projectId)}/deployments`);
}

export function getSite(projectId: string): Promise<SiteView | null> {
  return deployFetch(`${project(projectId)}/site`);
}

// The rollback probe can take up to the activation budget (~150 s).
export function rollbackDeployment(projectId: string, deploymentId: string): Promise<DeploymentView> {
  return deployFetch(
    `${project(projectId)}/rollback`,
    { method: "POST", body: JSON.stringify({ deploymentId }) },
    200_000,
  );
}

export function removeProjectSite(projectId: string): Promise<{ removed: boolean }> {
  return deployFetch(`${project(projectId)}/site`, { method: "DELETE" }, 120_000);
}

export type DomainView = {
  id: string;
  hostname: string;
  registrableDomain: string;
  isApex: boolean;
  status: string;
  steps: unknown[];
  currentDns: { resolvesTo: string[]; txtFound: string[] };
  certificate: { status: string | null; hint: string | null };
  failureReason: string | null;
  retryable: boolean;
  warning: string | null;
  lastCheckedAt: string | null;
  apexAdvice: string | null;
  notes: string[];
};

const domainPath = (projectId: string, domainId: string) =>
  `${project(projectId)}/domains/${encodeURIComponent(domainId)}`;

export function getProjectDomain(projectId: string): Promise<{ enabled: boolean; domain: DomainView | null }> {
  return deployFetch(`${project(projectId)}/domains`);
}

export function addProjectDomain(projectId: string, hostname: string): Promise<DomainView> {
  return deployFetch(`${project(projectId)}/domains`, { method: "POST", body: JSON.stringify({ hostname }) });
}

export function checkProjectDomain(projectId: string, domainId: string): Promise<DomainView> {
  return deployFetch(`${domainPath(projectId, domainId)}/check`, { method: "POST" });
}

export function retryProjectDomain(projectId: string, domainId: string): Promise<DomainView> {
  return deployFetch(`${domainPath(projectId, domainId)}/retry`, { method: "POST" });
}

export function removeProjectDomain(projectId: string, domainId: string): Promise<{ id: string; status: "REMOVING" }> {
  return deployFetch(domainPath(projectId, domainId), { method: "DELETE" });
}

export function teardownUserDomains(userId: string): Promise<{ tornDown: number }> {
  return deployFetch(`/internal/users/${encodeURIComponent(userId)}/domains/teardown`, { method: "POST" }, 120_000);
}
