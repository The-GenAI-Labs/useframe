import { describe, expect, it } from "vitest";
import { tick } from "@/domains/machine.js";
import { ProviderError } from "@/domains/provider.js";
import {
  addDomain,
  checkNow,
  getProjectDomain,
  removeDomain,
  retryDomain,
  runDomainGc,
  runDomainHealthcheck,
  teardownProjectDomain,
  teardownUserDomains,
} from "@/domains/service.js";
import { createHarness, type Harness } from "./fakes.js";

const HOST = "www.acme.com";
const DAY = 86_400_000;

async function claim(h: Harness, projectId = "p1", hostname = HOST) {
  const view = await addDomain(h.deps, projectId, hostname);
  return h.domain(view.id);
}

async function toRouting(h: Harness) {
  const row = await claim(h);
  h.publishTxt(HOST, row.ownershipToken as string);
  expect(await tick(h.deps, row.id)).toBe(0); // ownership found → CONFIGURING_EDGE
  expect(await tick(h.deps, row.id)).toBe(5000); // hostname created → AWAITING_ROUTING_DNS
  return row;
}

function goLiveAtEdge(h: Harness, row: { cfCustomHostnameId: unknown }, deploymentId: string | null) {
  h.provider.setLive(row.cfCustomHostnameId as string);
  h.prober.serve(HOST, deploymentId);
  h.dns.cname.set(HOST, ["cname.useframe.in."]);
}

describe("happy path (site already deployed)", () => {
  it("walks every state, serves early, redirects only at ACTIVE, rebuilds once, and reverses on removal", async () => {
    const h = createHarness({ deployed: true });
    const row = await claim(h);
    expect(row).toMatchObject({ status: "AWAITING_OWNERSHIP_TXT", isApex: false, cnameTarget: "cname.useframe.in" });
    expect(row.ownershipToken).toMatch(/^[0-9a-f]{32}$/);
    expect(h.scheduled).toEqual([{ domainId: row.id, delayMs: 0 }]);
    expect(h.provider.calls).toEqual([]);

    expect(await tick(h.deps, row.id)).toBe(15_000);
    expect(h.provider.calls).toEqual([]);
    expect((await getProjectDomain(h.deps, "p1"))?.steps[1].state).toBe("waiting");

    h.publishTxt(HOST, row.ownershipToken as string, 3);
    expect(await tick(h.deps, row.id)).toBe(0);
    expect(h.domain(row.id)).toMatchObject({ status: "CONFIGURING_EDGE" });
    expect(h.domain(row.id).ownershipVerifiedAt).toBeInstanceOf(Date);

    expect(await tick(h.deps, row.id)).toBe(5000);
    expect(h.domain(row.id).status).toBe("AWAITING_ROUTING_DNS");
    expect(h.provider.calls.filter((c) => c.startsWith("create"))).toHaveLength(1);
    // Custom host serves before the CNAME lands; the default host still serves too.
    expect(JSON.parse(h.kv.get(`h:${HOST}`)!)).toMatchObject({ t: "p", k: "p1/d1" });
    expect(JSON.parse(h.kv.get("h:acme-x7k.useframe.in")!)).toMatchObject({ t: "p" });

    expect(await tick(h.deps, row.id)).toBe(30_000);
    expect(h.domain(row.id).status).toBe("AWAITING_ROUTING_DNS");

    goLiveAtEdge(h, h.domain(row.id), "d1");
    expect(await tick(h.deps, row.id)).toBe(0);
    expect(h.domain(row.id)).toMatchObject({ status: "ACTIVE", sslStatus: "active" });
    expect(h.domain(row.id).verifiedAt).toBeInstanceOf(Date);
    expect(h.site().primaryHost).toBe(HOST);
    expect(JSON.parse(h.kv.get("h:acme-x7k.useframe.in")!)).toEqual({ v: 1, t: "r", u: `https://${HOST}` });

    expect(await tick(h.deps, row.id)).toBeNull();
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(h.redeploys).toEqual([{ projectId: "p1", versionId: "v1", siteUrl: `https://${HOST}` }]);

    // The system rebuild went live with the custom URL.
    const sys = h.db.tables.deployment.find((d) => d.id === "sys1")!;
    sys.status = "LIVE";
    h.site().activeDeploymentId = "sys1";

    const order: string[] = [];
    const sync = h.deps.syncSite;
    h.deps.syncSite = async (siteId, opts) => {
      order.push(`sync${opts?.deleteHosts ? ` -${opts.deleteHosts.join(",")}` : ""}`);
      return sync(siteId, opts);
    };
    const redeploy = h.deps.requestRedeploy;
    h.deps.requestRedeploy = async (input) => {
      order.push("redeploy");
      return redeploy(input);
    };
    const del = h.provider.delete.bind(h.provider);
    h.provider.delete = async (id) => {
      order.push("provider.delete");
      return del(id);
    };

    h.advance(1000);
    await removeDomain(h.deps, "p1", row.id);
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(order).toEqual([`sync -${HOST}`, "redeploy", "provider.delete"]);
    expect(h.site().primaryHost).toBe("acme-x7k.useframe.in");
    expect(h.kv.has(`h:${HOST}`)).toBe(false);
    expect(JSON.parse(h.kv.get("h:acme-x7k.useframe.in")!)).toMatchObject({ t: "p", k: "p1/sys1" });
    expect(h.redeploys.at(-1)).toEqual({ projectId: "p1", versionId: "v1", siteUrl: "https://acme-x7k.useframe.in" });
    expect(h.redeploys).toHaveLength(2);
    expect(h.provider.hostnames.size).toBe(0);
    expect(h.db.tables.customDomain).toHaveLength(0);
  });

  it("goes ACTIVE without a rebuild when the site was never deployed", async () => {
    const h = createHarness({ deployed: false });
    const row = await toRouting(h);
    expect(h.kv.has(`h:${HOST}`)).toBe(false);
    goLiveAtEdge(h, h.domain(row.id), null);
    expect(await tick(h.deps, row.id)).toBe(0);
    expect(h.domain(row.id).status).toBe("ACTIVE");
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(h.redeploys).toEqual([]);
  });
});

describe("probe rules", () => {
  it("needs Cloudflare active + health + the right deployment", async () => {
    const h = createHarness({ deployed: true });
    const row = await toRouting(h);
    h.provider.setLive(h.domain(row.id).cfCustomHostnameId);

    await tick(h.deps, row.id); // CF active, health unreachable (DNS elsewhere)
    expect(h.domain(row.id).status).toBe("AWAITING_ROUTING_DNS");

    h.prober.serve(HOST, "some-other-deployment");
    await tick(h.deps, row.id); // health OK, wrong deployment
    expect(h.domain(row.id).status).toBe("AWAITING_ROUTING_DNS");

    h.prober.serve(HOST, "d1");
    h.provider.hostnames.get(h.domain(row.id).cfCustomHostnameId)!.sslStatus = "pending_validation";
    await tick(h.deps, row.id); // probe would pass, certificate not active
    expect(h.domain(row.id).status).toBe("AWAITING_ROUTING_DNS");

    h.provider.setLive(h.domain(row.id).cfCustomHostnameId);
    await tick(h.deps, row.id);
    expect(h.domain(row.id).status).toBe("ACTIVE");
  });

  it("records where the domain currently points for the UI", async () => {
    const h = createHarness();
    const row = await toRouting(h);
    h.dns.a.set(HOST, ["203.0.113.7"]);
    await tick(h.deps, row.id);
    const view = (await getProjectDomain(h.deps, "p1"))!;
    expect(view.currentDns.resolvesTo).toEqual(["203.0.113.7"]);
    expect(view.steps[1].state).toBe("pending");
  });
});

describe("crash safety and adoption", () => {
  it("adopts its own hostname after a crash between create and saving the id", async () => {
    const h = createHarness();
    const row = await claim(h);
    h.publishTxt(HOST, row.ownershipToken as string);
    await tick(h.deps, row.id);

    const update = h.db.customDomain.update.bind(h.db.customDomain);
    let crashed = false;
    h.db.customDomain.update = (async (args: { data: Record<string, unknown> }) => {
      if (!crashed && "cfCustomHostnameId" in args.data) {
        crashed = true;
        throw new Error("process died");
      }
      return update(args as never);
    }) as never;

    await expect(tick(h.deps, row.id)).rejects.toThrow("process died");
    expect(h.domain(row.id).cfCustomHostnameId).toBeNull();
    expect(await tick(h.deps, row.id)).toBe(5000);
    expect(h.provider.calls.filter((c) => c.startsWith("create"))).toHaveLength(1);
    expect(h.provider.hostnames.size).toBe(1);
    expect(h.domain(row.id).cfCustomHostnameId).toBe([...h.provider.hostnames.keys()][0]);
  });

  it("adopts an orphan left by an interrupted teardown and re-applies settings", async () => {
    const h = createHarness();
    const orphan = h.provider.seed(HOST);
    const row = await toRouting(h);
    expect(h.domain(row.id).cfCustomHostnameId).toBe(orphan.id);
    expect(h.provider.calls).toContain(`revalidate ${orphan.id}`);
    expect(h.provider.calls.some((c) => c.startsWith("create"))).toBe(false);
  });

  it("fails without retry when another row owns the provider hostname", async () => {
    const h = createHarness();
    const existing = h.provider.seed(HOST);
    await h.db.customDomain.create({
      data: { projectId: "p2", domain: "stale.acme.com", status: "ACTIVE", cfCustomHostnameId: existing.id, ownershipVerifiedAt: new Date() },
    });
    const row = await claim(h);
    h.publishTxt(HOST, row.ownershipToken as string);
    await tick(h.deps, row.id);
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(h.domain(row.id)).toMatchObject({ status: "FAILED", failureCode: "hostname_conflict" });
    await expect(retryDomain(h.deps, "p1", row.id)).rejects.toMatchObject({ status: 409 });
  });

  it("revalidates a moved hostname at most once per 10 minutes", async () => {
    const h = createHarness();
    const row = await toRouting(h);
    const id = h.domain(row.id).cfCustomHostnameId;
    h.provider.hostnames.get(id)!.status = "moved";
    await tick(h.deps, row.id);
    await tick(h.deps, row.id);
    expect(h.provider.calls.filter((c) => c === `revalidate ${id}`)).toHaveLength(1);
  });

  it("recreates the hostname when the provider deleted it", async () => {
    const h = createHarness();
    const row = await toRouting(h);
    h.provider.hostnames.clear();
    expect(await tick(h.deps, row.id)).toBe(0);
    expect(h.domain(row.id)).toMatchObject({ status: "CONFIGURING_EDGE", cfCustomHostnameId: null, retryCount: 1 });
    expect(await tick(h.deps, row.id)).toBe(5000);
    expect(h.provider.hostnames.size).toBe(1);
  });

  it("removal is idempotent when a step fails midway", async () => {
    const h = createHarness({ deployed: true });
    const row = await toRouting(h);
    await removeDomain(h.deps, "p1", row.id);
    const del = h.provider.delete.bind(h.provider);
    let failOnce = true;
    h.provider.delete = async (id) => {
      if (failOnce) {
        failOnce = false;
        throw new ProviderError("transient", "502", 502);
      }
      return del(id);
    };
    await expect(tick(h.deps, row.id)).rejects.toThrow("502");
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(h.db.tables.customDomain).toHaveLength(0);
    expect(h.provider.hostnames.size).toBe(0);
    expect(h.redeploys).toHaveLength(0);
  });

  it("waits for an in-flight deploy before the reverse rebuild", async () => {
    const h = createHarness({ deployed: true });
    const row = await toRouting(h);
    goLiveAtEdge(h, h.domain(row.id), "d1");
    await tick(h.deps, row.id);
    h.setRedeployResult("busy");
    expect(await tick(h.deps, row.id)).toBe(60_000);
    h.setRedeployResult("queued");
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(h.redeploys).toHaveLength(1);
  });
});

describe("failures and retry", () => {
  it("ownership never found → FAILED (retryable) → Retry keeps the token and resets the clock", async () => {
    const h = createHarness();
    const row = await claim(h);
    const token = row.ownershipToken;
    h.advance(73 * 3600_000);
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(h.domain(row.id)).toMatchObject({ status: "FAILED", failureCode: "ownership_timeout", failureReason: "We never found the verification record." });
    const view = await retryDomain(h.deps, "p1", row.id);
    expect(view.status).toBe("AWAITING_OWNERSHIP_TXT");
    expect(h.domain(row.id).ownershipToken).toBe(token);
    expect(await tick(h.deps, row.id)).toBe(15_000);
  });

  it("routing never found → FAILED, custom host stops serving, Retry revalidates", async () => {
    const h = createHarness({ deployed: true });
    const row = await toRouting(h);
    expect(h.kv.has(`h:${HOST}`)).toBe(true);
    h.advance(8 * DAY);
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(h.domain(row.id)).toMatchObject({ status: "FAILED", failureCode: "routing_timeout", failureReason: "The routing record never pointed to UseFrame." });
    expect(h.kv.has(`h:${HOST}`)).toBe(false);
    await retryDomain(h.deps, "p1", row.id);
    expect(h.domain(row.id).status).toBe("AWAITING_ROUTING_DNS");
    expect(h.provider.calls.at(-1)).toMatch(/^revalidate /);
  });

  it("quota errors alert and fail retryably", async () => {
    const h = createHarness();
    const row = await claim(h);
    h.publishTxt(HOST, row.ownershipToken as string);
    await tick(h.deps, row.id);
    h.provider.failCreateWith = new ProviderError("quota", "Quota exceeded", 403);
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(h.domain(row.id)).toMatchObject({ status: "FAILED", failureCode: "quota" });
    expect(h.alerts.some((a) => a.includes("quota"))).toBe(true);
    h.provider.failCreateWith = null;
    await retryDomain(h.deps, "p1", row.id);
    expect(h.domain(row.id).status).toBe("CONFIGURING_EDGE");
  });

  it("blocked hostnames fail without retry", async () => {
    const h = createHarness();
    const row = await toRouting(h);
    h.provider.hostnames.get(h.domain(row.id).cfCustomHostnameId)!.status = "blocked";
    expect(await tick(h.deps, row.id)).toBeNull();
    expect(h.domain(row.id)).toMatchObject({ status: "FAILED", failureCode: "blocked", failureReason: "This domain can't be connected. Contact support." });
  });
});

describe("claim rules", () => {
  it("rejects invalid hostnames with a code", async () => {
    const h = createHarness();
    await expect(addDomain(h.deps, "p1", "acme-x7k.useframe.in")).rejects.toMatchObject({ status: 422, code: "platform_domain" });
  });

  it("is idempotent for the same project and allows one domain per project", async () => {
    const h = createHarness();
    const first = await addDomain(h.deps, "p1", "https://WWW.acme.com/");
    const again = await addDomain(h.deps, "p1", HOST);
    expect(again.id).toBe(first.id);
    await expect(addDomain(h.deps, "p1", "shop.acme.com")).rejects.toMatchObject({ status: 409, code: "one_domain_per_project" });
  });

  it("an unproven squatter claim never blocks the real owner", async () => {
    const h = createHarness();
    const squatter = await claim(h, "p2");
    const owner = await claim(h, "p1");
    expect(h.db.tables.customDomain.map((d) => d.id)).toEqual([owner.id]);
    expect(h.domain(squatter.id)).toBeUndefined();

    h.publishTxt(HOST, owner.ownershipToken as string);
    await tick(h.deps, owner.id);
    expect(h.domain(owner.id).ownershipVerifiedAt).toBeInstanceOf(Date);
    await expect(addDomain(h.deps, "p2", HOST)).rejects.toMatchObject({ status: 409, code: "domain_in_use" });
  });

  it("enforces the capacity cap from the DB and the provider", async () => {
    const h = createHarness();
    h.deps.config = { ...h.deps.config, capacityLimit: 1 };
    await claim(h, "p2", "www.other.com");
    await expect(addDomain(h.deps, "p1", HOST)).rejects.toMatchObject({ status: 503, code: "capacity_unavailable" });
    expect(h.alerts).toContain("custom domain capacity reached");

    const h2 = createHarness();
    h2.deps.config = { ...h2.deps.config, capacityLimit: 1 };
    h2.provider.seed("someone-elses.example");
    await expect(addDomain(h2.deps, "p1", HOST)).rejects.toMatchObject({ status: 503 });
    expect(h2.db.tables.customDomain).toHaveLength(0);
  });

  it("scopes mutations to the owning project and rate-limits revalidation on Check now", async () => {
    const h = createHarness();
    const row = await toRouting(h);
    await expect(removeDomain(h.deps, "p2", row.id)).rejects.toMatchObject({ status: 404 });
    await checkNow(h.deps, "p1", row.id);
    await checkNow(h.deps, "p1", row.id);
    const id = h.domain(row.id).cfCustomHostnameId;
    expect(h.provider.calls.filter((c) => c === `revalidate ${id}`)).toHaveLength(1);
    expect(h.scheduled.filter((s) => s.delayMs === 0).length).toBeGreaterThanOrEqual(3);
  });
});

describe("hooks, GC and healthcheck", () => {
  it("project deletion tears the domain down inline without a rebuild", async () => {
    const h = createHarness({ deployed: true });
    const row = await toRouting(h);
    expect(await teardownProjectDomain(h.deps, "p1")).toBe(true);
    expect(h.db.tables.customDomain).toHaveLength(0);
    expect(h.provider.hostnames.size).toBe(0);
    expect(h.redeploys).toHaveLength(0);
    expect(h.kv.has(`h:${HOST}`)).toBe(false);
    expect(row.id).toBeTruthy();
  });

  it("user deletion tears down every project's domain", async () => {
    const h = createHarness();
    await toRouting(h);
    expect(await teardownUserDomains(h.deps, "u1")).toBe(1);
    expect(h.db.tables.customDomain).toHaveLength(0);
  });

  it("weekly GC applies the three rules and leaves fresh rows alone", async () => {
    const h = createHarness();
    const now = h.deps.now().getTime();
    const old = new Date(now - 8 * DAY);
    await h.db.customDomain.create({ data: { projectId: "p2", domain: "stale-claim.com", status: "AWAITING_OWNERSHIP_TXT", createdAt: old } });
    const failed = await h.db.customDomain.create({
      data: { projectId: "p1", domain: "failed.com", status: "FAILED", stateChangedAt: old, cfCustomHostnameId: "cf-x", ownershipVerifiedAt: old },
    });
    await h.db.customDomain.create({ data: { projectId: "p3", domain: "fresh.com", status: "AWAITING_OWNERSHIP_TXT" } });
    const result = await runDomainGc(h.deps);
    expect(result).toEqual({ deleted: 1, tornDown: 1 });
    expect(h.domain(failed.id).status).toBe("REMOVING");
    expect(h.db.tables.customDomain.map((d) => d.domain).sort()).toEqual(["failed.com", "fresh.com"]);
  });

  it("GC tears down reserved rows stuck past the routing window + 7 days", async () => {
    const h = createHarness();
    const row = await toRouting(h);
    h.advance(15 * DAY);
    await runDomainGc(h.deps);
    expect(h.domain(row.id).status).toBe("REMOVING");
  });

  it("daily healthcheck warns but never tears down, and alerts after 3 failing days", async () => {
    const h = createHarness({ deployed: true });
    const row = await toRouting(h);
    goLiveAtEdge(h, h.domain(row.id), "d1");
    await tick(h.deps, row.id);
    h.prober.responses.clear();
    for (let day = 0; day < 3; day++) await runDomainHealthcheck(h.deps);
    expect(h.domain(row.id)).toMatchObject({ status: "ACTIVE" });
    expect(h.domain(row.id).failureReason).toContain("couldn't reach");
    expect((await getProjectDomain(h.deps, "p1"))?.warning).toContain("couldn't reach");
    expect(h.alerts.some((a) => a.includes("3 days"))).toBe(true);

    h.prober.serve(HOST, "d1");
    await runDomainHealthcheck(h.deps);
    expect(h.domain(row.id).failureReason).toBeNull();
  });
});
