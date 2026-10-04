import { log } from "@/lib/logger.js";
import { checkTxtRecord, observeRouting } from "./dns.js";
import type { DomainDeps, RedeployResult } from "./deps.js";
import { FAILURES, type FailureCode } from "./failures.js";
import {
  certificateHint,
  OWNERSHIP_VALUE_PREFIX,
  ownershipRecordName,
  ownershipRecordValue,
  type Observation,
} from "./instructions.js";
import { probeDomain } from "./prober.js";
import { ProviderError, type CustomHostnameState } from "./provider.js";
import { ownershipDelay, REVALIDATE_INTERVAL_S, routingDelay, TEARDOWN_RETRY_MS } from "./schedule.js";

type Row = NonNullable<Awaited<ReturnType<DomainDeps["db"]["customDomain"]["findUnique"]>>>;

/** Delay until the next tick, or null when the domain needs no more ticks. */
export type TickResult = number | null;

export type TickOptions = { skipRedeploy?: boolean };

async function mergeObservation(deps: DomainDeps, id: string, patch: Observation): Promise<void> {
  const current = (await deps.scratch.getObservation(id)) ?? {};
  await deps.scratch.setObservation(id, { ...current, ...patch });
}

async function update(deps: DomainDeps, id: string, data: Record<string, unknown>): Promise<void> {
  await deps.db.customDomain.update({ where: { id }, data });
}

async function enter(deps: DomainDeps, row: Row, status: Row["status"], data: Record<string, unknown> = {}) {
  await update(deps, row.id, {
    status,
    stateChangedAt: deps.now(),
    failureCode: null,
    failureReason: null,
    ...data,
  });
}

export async function fail(deps: DomainDeps, row: Row, code: FailureCode): Promise<TickResult> {
  const wasServing = row.status === "AWAITING_ROUTING_DNS";
  await update(deps, row.id, {
    status: "FAILED",
    stateChangedAt: deps.now(),
    failureCode: code,
    failureReason: FAILURES[code].message,
  });
  if (wasServing) {
    const site = await deps.db.projectSite.findUnique({ where: { projectId: row.projectId }, select: { id: true } });
    if (site) await deps.syncSite(site.id, { deleteHosts: [row.domain] });
  }
  log.warn("custom domain failed", { domainId: row.id, hostname: row.domain, code });
  return null;
}

// Rebuild the live deployment once with the new canonical URL (free). Derived from
// state, so a crash or retry never enqueues a second rebuild for the same change.
export async function ensureSiteUrlRedeploy(
  deps: DomainDeps,
  projectId: string,
  since: Date,
): Promise<RedeployResult> {
  const site = await deps.db.projectSite.findUnique({
    where: { projectId },
    select: { id: true, primaryHost: true, activeDeploymentId: true, suspendedAt: true },
  });
  if (!site?.activeDeploymentId || site.suspendedAt) return "skipped";
  const target = `https://${site.primaryHost}`;
  const active = await deps.db.deployment.findUnique({
    where: { id: site.activeDeploymentId },
    select: { versionId: true, siteUrl: true },
  });
  if (!active || active.siteUrl === target) return "skipped";
  const already = await deps.db.deployment.findFirst({
    where: { siteId: site.id, triggeredBy: "domain_change", siteUrl: target, createdAt: { gte: since } },
    select: { id: true },
  });
  if (already) return "skipped";
  const project = await deps.db.project.findUnique({ where: { id: projectId }, select: { userId: true } });
  if (!project) return "skipped";
  return deps.requestRedeploy({ projectId, versionId: active.versionId, userId: project.userId });
}

async function awaitOwnership(deps: DomainDeps, row: Row): Promise<TickResult> {
  const elapsed = deps.now().getTime() - row.stateChangedAt.getTime();
  const check = await checkTxtRecord(
    deps.dns,
    ownershipRecordName(row.domain),
    ownershipRecordValue(row.ownershipToken ?? ""),
    OWNERSHIP_VALUE_PREFIX,
  );
  await mergeObservation(deps, row.id, { ownership: check.state, txtFound: check.values });
  await update(deps, row.id, { lastCheckedAt: deps.now() });

  if (check.state === "found") {
    await enter(deps, row, "CONFIGURING_EDGE", { ownershipVerifiedAt: deps.now() });
    return 0;
  }
  if (elapsed >= deps.config.ownershipWindowMs) return fail(deps, row, "ownership_timeout");
  return ownershipDelay(elapsed);
}

async function configureEdge(deps: DomainDeps, row: Row): Promise<TickResult> {
  const site = await deps.db.projectSite.findUnique({ where: { projectId: row.projectId }, select: { id: true } });
  if (!site) throw new Error(`No site for project ${row.projectId}`);

  let state: CustomHostnameState | null = row.cfCustomHostnameId
    ? await deps.provider.get(row.cfCustomHostnameId)
    : null;

  if (!state) {
    const existing = await deps.provider.findByHostname(row.domain);
    if (existing) {
      const owner = await deps.db.customDomain.findFirst({
        where: { cfCustomHostnameId: existing.id, NOT: { id: row.id } },
        select: { id: true },
      });
      if (owner) return fail(deps, row, "hostname_conflict");
      // Ours from a crash before the id was saved, or an orphan from an interrupted
      // teardown of this same hostname: adopt it and re-apply our certificate settings.
      await update(deps, row.id, { cfCustomHostnameId: existing.id });
      state = await deps.provider.revalidate(existing.id);
    } else {
      try {
        state = await deps.provider.create(row.domain);
      } catch (err) {
        if (err instanceof ProviderError) {
          if (err.kind === "duplicate") return 1000;
          if (err.kind === "quota") {
            deps.alert("custom hostname quota reached at the provider", { hostname: row.domain });
            return fail(deps, row, "quota");
          }
          if (err.kind === "invalid") return fail(deps, row, "invalid_hostname");
        }
        throw err;
      }
      await update(deps, row.id, { cfCustomHostnameId: state.id });
    }
  }

  if (deps.provider.isBlocked(state)) return fail(deps, row, "blocked");
  await enter(deps, row, "AWAITING_ROUTING_DNS", {
    cfHostnameStatus: state.status,
    sslStatus: state.sslStatus,
    lastCheckedAt: deps.now(),
  });
  // Serve on the custom host before the user's CNAME lands; the default host is untouched.
  await deps.syncSite(site.id);
  return 5000;
}

async function goActive(deps: DomainDeps, row: Row, siteId: string): Promise<TickResult> {
  const now = deps.now();
  await deps.db.$transaction([
    deps.db.customDomain.update({
      where: { id: row.id },
      data: {
        status: "ACTIVE",
        verifiedAt: row.verifiedAt ?? now,
        stateChangedAt: now,
        failureCode: null,
        failureReason: null,
      },
    }),
    deps.db.projectSite.update({ where: { id: siteId }, data: { primaryHost: row.domain } }),
  ]);
  await deps.syncSite(siteId);
  log.info("custom domain active", { domainId: row.id, hostname: row.domain });
  return 0;
}

async function awaitRouting(deps: DomainDeps, row: Row): Promise<TickResult> {
  const elapsed = deps.now().getTime() - row.stateChangedAt.getTime();
  const site = await deps.db.projectSite.findUnique({
    where: { projectId: row.projectId },
    select: { id: true, activeDeploymentId: true },
  });
  if (!site) throw new Error(`No site for project ${row.projectId}`);
  if (!row.cfCustomHostnameId) {
    await enter(deps, row, "CONFIGURING_EDGE");
    return 0;
  }

  const state = await deps.provider.get(row.cfCustomHostnameId);
  if (!state) {
    // The provider removed it (e.g. it sat "moved" too long): create it again.
    await enter(deps, row, "CONFIGURING_EDGE", { cfCustomHostnameId: null, retryCount: { increment: 1 } });
    return 0;
  }
  if (deps.provider.isBlocked(state)) return fail(deps, row, "blocked");

  if (deps.provider.needsRevalidation(state) && (await deps.scratch.claim(`revalidate:${state.id}`, REVALIDATE_INTERVAL_S))) {
    await deps.provider.revalidate(state.id);
  }

  if (site.activeDeploymentId && (await deps.readKv(`h:${row.domain}`)) === null) {
    await deps.syncSite(site.id);
  }

  const routing = await observeRouting(deps.dns, row.domain, deps.config.edgeTarget);
  const live = deps.provider.isLive(state);
  const probe = live ? await probeDomain(deps.prober, row.domain, site.activeDeploymentId) : null;

  await mergeObservation(deps, row.id, {
    resolvesTo: routing.resolvesTo,
    pointsAtEdge: routing.pointsAtEdge,
    certificateHint: certificateHint([...state.validationErrors, ...state.verificationErrors]),
  });
  await update(deps, row.id, {
    cfHostnameStatus: state.status,
    sslStatus: state.sslStatus,
    sslIssuedAt: state.certIssuedAt,
    sslExpiresAt: state.certExpiresAt,
    lastCheckedAt: deps.now(),
  });

  if (live && probe?.ok) return goActive(deps, row, site.id);
  if (elapsed >= deps.config.routingWindowMs) return fail(deps, row, "routing_timeout");
  return routingDelay(elapsed);
}

// Strict order: stop serving the custom host, rebuild with the default URL,
// delete the provider hostname (and its certificate), then the row.
async function teardown(deps: DomainDeps, row: Row, options: TickOptions): Promise<TickResult> {
  const site = await deps.db.projectSite.findUnique({
    where: { projectId: row.projectId },
    select: { id: true, defaultHost: true, primaryHost: true },
  });
  if (site) {
    if (site.primaryHost === row.domain) {
      await deps.db.projectSite.update({ where: { id: site.id }, data: { primaryHost: site.defaultHost } });
    }
    await deps.syncSite(site.id, { deleteHosts: [row.domain] });
    if (!options.skipRedeploy && (await ensureSiteUrlRedeploy(deps, row.projectId, row.stateChangedAt)) === "busy") {
      return TEARDOWN_RETRY_MS;
    }
  }
  if (row.cfCustomHostnameId) {
    await deps.provider.delete(row.cfCustomHostnameId);
    await update(deps, row.id, { cfCustomHostnameId: null });
  }
  log.info("audit: custom domain removed", {
    domainId: row.id,
    hostname: row.domain,
    projectId: row.projectId,
    reserved: !!row.ownershipVerifiedAt,
  });
  await deps.db.customDomain.delete({ where: { id: row.id } });
  return null;
}

export async function tick(deps: DomainDeps, domainId: string, options: TickOptions = {}): Promise<TickResult> {
  const row = await deps.db.customDomain.findUnique({ where: { id: domainId } });
  if (!row) return null;
  switch (row.status) {
    case "AWAITING_OWNERSHIP_TXT":
      return awaitOwnership(deps, row);
    case "CONFIGURING_EDGE":
      return configureEdge(deps, row);
    case "AWAITING_ROUTING_DNS":
      return awaitRouting(deps, row);
    case "ACTIVE":
      return (await ensureSiteUrlRedeploy(deps, row.projectId, row.stateChangedAt)) === "busy" ? 60_000 : null;
    case "REMOVING":
      return teardown(deps, row, options);
    default:
      return null;
  }
}

/** Runs ticks inline until the domain settles (used by teardown hooks and admin CLIs). */
export async function runUntilSettled(
  deps: DomainDeps,
  domainId: string,
  options: TickOptions = {},
  maxTicks = 20,
): Promise<TickResult> {
  let next: TickResult = 0;
  for (let i = 0; i < maxTicks && next === 0; i++) next = await tick(deps, domainId, options);
  return next;
}
