import { randomBytes } from "node:crypto";
import { log } from "@/lib/logger.js";
import { HttpError } from "@/services/httpError.js";
import { ensureSite, isUniqueViolation } from "@/site/ensureSite.js";
import type { DomainDeps } from "./deps.js";
import { isRetryable } from "./failures.js";
import { validateHostname } from "./hostname.js";
import { buildInstructions } from "./instructions.js";
import { runUntilSettled } from "./machine.js";
import { probeDomain } from "./prober.js";
import { REVALIDATE_INTERVAL_S } from "./schedule.js";

const DAY = 24 * 60 * 60 * 1000;

type Row = NonNullable<Awaited<ReturnType<DomainDeps["db"]["customDomain"]["findUnique"]>>>;

export const isReserved = (row: { ownershipVerifiedAt: Date | null }) => row.ownershipVerifiedAt !== null;

async function view(deps: DomainDeps, row: Row) {
  return buildInstructions(row, deps.config.edgeTarget, (await deps.scratch.getObservation(row.id)) ?? {});
}

async function domainForProject(deps: DomainDeps, projectId: string, domainId: string): Promise<Row> {
  const row = await deps.db.customDomain.findFirst({ where: { id: domainId, projectId } });
  if (!row) throw new HttpError(404, "Domain not found", "domain_not_found");
  return row;
}

async function assertCapacity(deps: DomainDeps): Promise<void> {
  const limit = deps.config.capacityLimit;
  const local = await deps.db.customDomain.count({ where: { status: { not: "FAILED" } } });
  const remote = local >= limit ? local : await deps.provider.count();
  if (local >= limit || remote >= limit) {
    deps.alert("custom domain capacity reached", { local, remote, limit });
    throw new HttpError(503, "Custom domains are temporarily unavailable. Please try again later.", "capacity_unavailable");
  }
}

export async function addDomain(deps: DomainDeps, projectId: string, input: string) {
  const parsed = validateHostname(input, deps.config);
  if (!parsed.ok) throw new HttpError(422, parsed.message, parsed.code);

  const project = await deps.db.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } });
  if (!project) throw new HttpError(404, "Project not found", "project_not_found");

  const current = await deps.db.customDomain.findUnique({ where: { projectId } });
  if (current) {
    if (current.domain === parsed.hostname) return view(deps, current);
    throw new HttpError(409, "This project already has a custom domain. Remove it first.", "one_domain_per_project");
  }

  const claimed = await deps.db.customDomain.findUnique({ where: { domain: parsed.hostname } });
  if (claimed && isReserved(claimed)) {
    throw new HttpError(409, "This domain is already connected to another project.", "domain_in_use");
  }

  await assertCapacity(deps);
  await ensureSite(deps.db, projectId, deps.config.baseDomain);

  const data = {
    projectId,
    domain: parsed.hostname,
    status: "AWAITING_OWNERSHIP_TXT" as const,
    ownershipToken: randomBytes(16).toString("hex"),
    isApex: parsed.isApex,
    cnameTarget: deps.config.edgeTarget,
    stateChangedAt: deps.now(),
  };

  let row: Row;
  try {
    // An unproven claim on another project never blocks the real owner.
    row = await deps.db.$transaction(async (tx) => {
      if (claimed) {
        await tx.customDomain.deleteMany({ where: { id: claimed.id, ownershipVerifiedAt: null } });
        log.info("audit: replaced unproven domain claim", {
          hostname: parsed.hostname,
          fromProject: claimed.projectId,
          toProject: projectId,
        });
      }
      return tx.customDomain.create({ data });
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new HttpError(409, "This domain is already connected to another project.", "domain_in_use");
    }
    throw err;
  }

  await deps.schedule(row.id, 0);
  return view(deps, row);
}

export async function getProjectDomain(deps: DomainDeps, projectId: string) {
  const row = await deps.db.customDomain.findUnique({ where: { projectId } });
  if (!row || !["AWAITING_OWNERSHIP_TXT", "CONFIGURING_EDGE", "AWAITING_ROUTING_DNS", "ACTIVE", "FAILED", "REMOVING"].includes(row.status)) {
    return null;
  }
  return view(deps, row);
}

export async function checkNow(deps: DomainDeps, projectId: string, domainId: string) {
  const row = await domainForProject(deps, projectId, domainId);
  if (
    row.status === "AWAITING_ROUTING_DNS" &&
    row.cfCustomHostnameId &&
    (await deps.scratch.claim(`revalidate:${row.cfCustomHostnameId}`, REVALIDATE_INTERVAL_S))
  ) {
    await deps.provider.revalidate(row.cfCustomHostnameId);
  }
  if (["AWAITING_OWNERSHIP_TXT", "CONFIGURING_EDGE", "AWAITING_ROUTING_DNS"].includes(row.status)) {
    await deps.schedule(row.id, 0);
  }
  return view(deps, row);
}

export async function retryDomain(deps: DomainDeps, projectId: string, domainId: string) {
  const row = await domainForProject(deps, projectId, domainId);
  if (row.status !== "FAILED" || !isRetryable(row.failureCode)) {
    throw new HttpError(409, "This domain can't be retried.", "not_retryable");
  }
  const status =
    row.failureCode === "ownership_timeout" || !row.ownershipVerifiedAt
      ? "AWAITING_OWNERSHIP_TXT"
      : row.failureCode === "routing_timeout" && row.cfCustomHostnameId
        ? "AWAITING_ROUTING_DNS"
        : "CONFIGURING_EDGE";
  await deps.db.customDomain.update({
    where: { id: row.id },
    data: { status, stateChangedAt: deps.now(), failureCode: null, failureReason: null },
  });
  if (status === "AWAITING_ROUTING_DNS" && row.cfCustomHostnameId) {
    await deps.provider.revalidate(row.cfCustomHostnameId).catch(() => undefined);
  }
  await deps.schedule(row.id, 0);
  return view(deps, (await deps.db.customDomain.findUnique({ where: { id: row.id } }))!);
}

async function markRemoving(deps: DomainDeps, row: Row): Promise<void> {
  if (row.status !== "REMOVING") {
    await deps.db.customDomain.update({
      where: { id: row.id },
      data: { status: "REMOVING", stateChangedAt: deps.now() },
    });
  }
}

export async function removeDomain(deps: DomainDeps, projectId: string, domainId: string) {
  const row = await domainForProject(deps, projectId, domainId);
  await markRemoving(deps, row);
  await deps.schedule(row.id, 0);
  return { id: row.id, status: "REMOVING" as const };
}

/** Admin: a domain legitimately changed hands. */
export async function releaseDomain(deps: DomainDeps, hostname: string, reason: string) {
  const row = await deps.db.customDomain.findUnique({ where: { domain: hostname.toLowerCase() } });
  if (!row) throw new HttpError(404, "No claim for that domain", "domain_not_found");
  log.warn("audit: releasing custom domain", { hostname: row.domain, projectId: row.projectId, reason });
  await markRemoving(deps, row);
  const next = await runUntilSettled(deps, row.id);
  if (next !== null) await deps.schedule(row.id, next);
  return { released: next === null, projectId: row.projectId };
}

// Project/user deletion: no rebuild, the site is going away too.
export async function teardownProjectDomain(deps: DomainDeps, projectId: string): Promise<boolean> {
  const row = await deps.db.customDomain.findUnique({ where: { projectId } });
  if (!row) return false;
  await markRemoving(deps, row);
  const next = await runUntilSettled(deps, row.id, { skipRedeploy: true });
  if (next !== null) await deps.schedule(row.id, next);
  return true;
}

export async function teardownUserDomains(deps: DomainDeps, userId: string): Promise<number> {
  const rows = await deps.db.customDomain.findMany({
    where: { project: { userId } },
    select: { projectId: true },
  });
  for (const row of rows) await teardownProjectDomain(deps, row.projectId);
  return rows.length;
}

export async function runDomainGc(deps: DomainDeps): Promise<{ deleted: number; tornDown: number }> {
  const now = deps.now().getTime();
  const weekAgo = new Date(now - 7 * DAY);
  const { count: deleted } = await deps.db.customDomain.deleteMany({
    where: { status: "AWAITING_OWNERSHIP_TXT", createdAt: { lt: weekAgo } },
  });
  const stale = await deps.db.customDomain.findMany({
    where: {
      OR: [
        { status: "FAILED", stateChangedAt: { lt: weekAgo }, cfCustomHostnameId: { not: null } },
        {
          status: "AWAITING_ROUTING_DNS",
          ownershipVerifiedAt: { not: null },
          stateChangedAt: { lt: new Date(now - deps.config.routingWindowMs - 7 * DAY) },
        },
      ],
    },
  });
  for (const row of stale) {
    await markRemoving(deps, row);
    await deps.schedule(row.id, 0);
  }
  log.info("domain gc", { deleted, tornDown: stale.length });
  return { deleted, tornDown: stale.length };
}

// Never tears anything down: the customer may simply have moved their DNS.
export async function runDomainHealthcheck(deps: DomainDeps): Promise<{ checked: number; warnings: number }> {
  const rows = await deps.db.customDomain.findMany({ where: { status: "ACTIVE" } });
  let warnings = 0;
  for (const row of rows) {
    const site = await deps.db.projectSite.findUnique({
      where: { projectId: row.projectId },
      select: { activeDeploymentId: true },
    });
    const state = row.cfCustomHostnameId ? await deps.provider.get(row.cfCustomHostnameId) : null;
    let warning: string | null = null;
    if (!state) {
      warning = "This domain is no longer registered with our edge. Remove and reconnect it.";
      deps.alert("active custom domain missing at provider", { hostname: row.domain });
    } else {
      if (state.status === "moved") warning = "Your domain no longer points to UseFrame. Check your CNAME record.";
      if (state.sslStatus !== "active") {
        deps.alert("custom domain certificate not active", { hostname: row.domain, sslStatus: state.sslStatus });
      }
    }
    const probe = await probeDomain(deps.prober, row.domain, site?.activeDeploymentId ?? null);
    if (!warning && !probe.ok) warning = "We couldn't reach your site on this domain in our last check.";

    await deps.db.customDomain.update({
      where: { id: row.id },
      data: {
        failureReason: warning,
        lastCheckedAt: deps.now(),
        ...(state ? { cfHostnameStatus: state.status, sslStatus: state.sslStatus } : {}),
      },
    });
    if (warning) {
      warnings++;
      const streak = await deps.scratch.incr(`health:${row.id}`, 4 * 24 * 60 * 60);
      if (streak >= 3) deps.alert("custom domain failing healthcheck 3 days running", { hostname: row.domain });
    } else {
      await deps.scratch.clear(`health:${row.id}`);
    }
  }
  return { checked: rows.length, warnings };
}
