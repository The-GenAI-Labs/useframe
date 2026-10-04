import type { DomainConfig, DomainDeps, DomainScratch, RedeployResult } from "@/domains/deps.js";
import type { DnsLookup } from "@/domains/dns.js";
import type { Observation } from "@/domains/instructions.js";
import type { HttpsProber, ProbeResponse } from "@/domains/prober.js";
import { ProviderError, type CustomHostnameProvider, type CustomHostnameState } from "@/domains/provider.js";
import { computeDesiredEntries } from "@/site/desired.js";
import { loadSiteState } from "@/site/sync.js";

type Row = Record<string, unknown> & { id: string };

let seq = 0;
const nextId = (prefix: string) => `${prefix}${++seq}`;

function matches(row: Row, where: Record<string, unknown> | undefined, db: FakeDb): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Record<string, unknown>[]).some((c) => matches(row, c, db));
    if (key === "NOT") return !matches(row, cond as Record<string, unknown>, db);
    if (key === "project") {
      const project = db.tables.project.find((p) => p.id === row.projectId);
      return !!project && matches(project, cond as Record<string, unknown>, db);
    }
    const value = row[key];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      return Object.entries(cond as Record<string, unknown>).every(([op, arg]) => {
        const v = value instanceof Date ? value.getTime() : value;
        const a = arg instanceof Date ? arg.getTime() : arg;
        switch (op) {
          case "in":
            return (arg as unknown[]).includes(value);
          case "not":
            return a === null ? v !== null && v !== undefined : v !== a;
          case "lt":
            return (v as number) < (a as number);
          case "gte":
            return (v as number) >= (a as number);
          default:
            throw new Error(`unsupported op ${op}`);
        }
      });
    }
    return (value ?? null) === cond;
  });
}

function apply(row: Row, data: Record<string, unknown>) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in (value as object)) {
      row[key] = ((row[key] as number) ?? 0) + (value as { increment: number }).increment;
    } else row[key] = value;
  }
  row.updatedAt = new Date();
}

class Table {
  constructor(
    readonly rows: Row[],
    private readonly db: FakeDb,
    private readonly prefix: string,
    private readonly unique: string[],
    private readonly defaults: () => Record<string, unknown>,
  ) {}
  private checkUnique(row: Row) {
    for (const key of this.unique) {
      if (row[key] === null || row[key] === undefined) continue;
      if (this.rows.some((r) => r !== row && r[key] === row[key])) {
        throw Object.assign(new Error(`Unique constraint on ${key}`), { code: "P2002" });
      }
    }
  }
  // Snapshots, like Prisma: callers never see later writes through a returned row.
  async findUnique(args: { where: Record<string, unknown> }) {
    const row = this.rows.find((r) => matches(r, args.where, this.db));
    return row ? { ...row } : null;
  }
  async findUniqueOrThrow(args: { where: Record<string, unknown> }) {
    const row = await this.findUnique(args);
    if (!row) throw new Error("not found");
    return row;
  }
  async findFirst(args: { where?: Record<string, unknown> } = {}) {
    const row = this.rows.find((r) => matches(r, args.where, this.db));
    return row ? { ...row } : null;
  }
  async findMany(args: { where?: Record<string, unknown> } = {}) {
    return this.rows.filter((r) => matches(r, args.where, this.db)).map((r) => ({ ...r }));
  }
  async count(args: { where?: Record<string, unknown> } = {}) {
    return (await this.findMany(args)).length;
  }
  async create(args: { data: Record<string, unknown> }) {
    const row = { id: nextId(this.prefix), createdAt: new Date(), updatedAt: new Date(), ...this.defaults(), ...args.data } as Row;
    this.checkUnique(row);
    this.rows.push(row);
    return { ...row };
  }
  async update(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
    const row = this.rows.find((r) => matches(r, args.where, this.db));
    if (!row) throw new Error("update: not found");
    const before = { ...row };
    apply(row, args.data);
    try {
      this.checkUnique(row);
    } catch (err) {
      Object.assign(row, before);
      throw err;
    }
    return { ...row };
  }
  async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
    const rows = this.rows.filter((r) => matches(r, args.where, this.db));
    rows.forEach((r) => apply(r, args.data));
    return { count: rows.length };
  }
  async delete(args: { where: Record<string, unknown> }) {
    const index = this.rows.findIndex((r) => matches(r, args.where, this.db));
    if (index === -1) throw new Error("delete: not found");
    return this.rows.splice(index, 1)[0];
  }
  async deleteMany(args: { where?: Record<string, unknown> } = {}) {
    const keep = this.rows.filter((r) => !matches(r, args.where, this.db));
    const count = this.rows.length - keep.length;
    this.rows.splice(0, this.rows.length, ...keep);
    return { count };
  }
}

export class FakeDb {
  readonly tables = { customDomain: [] as Row[], projectSite: [] as Row[], deployment: [] as Row[], project: [] as Row[] };
  readonly customDomain = new Table(this.tables.customDomain, this, "dom", ["domain", "projectId", "cfCustomHostnameId"], () => ({
    status: "PENDING",
    ownershipToken: null,
    ownershipVerifiedAt: null,
    cfCustomHostnameId: null,
    cfHostnameStatus: null,
    isApex: false,
    retryCount: 0,
    stateChangedAt: new Date(),
    verifiedAt: null,
    lastCheckedAt: null,
    failureReason: null,
    failureCode: null,
    sslStatus: null,
    sslIssuedAt: null,
    sslExpiresAt: null,
    cnameTarget: null,
    deletedAt: null,
  }));
  readonly projectSite = new Table(this.tables.projectSite, this, "site", ["projectId", "subdomainLabel", "defaultHost"], () => ({
    activeDeploymentId: null,
    suspendedAt: null,
    suspendedReason: null,
  }));
  readonly deployment = new Table(this.tables.deployment, this, "dep", [], () => ({ framework: "VITE_SPA" }));
  readonly project = new Table(this.tables.project, this, "proj", [], () => ({ deletedAt: null, name: "Acme" }));

  async $transaction(arg: unknown) {
    if (Array.isArray(arg)) return Promise.all(arg);
    return (arg as (tx: FakeDb) => Promise<unknown>)(this);
  }
}

export class FakeProvider implements CustomHostnameProvider {
  readonly hostnames = new Map<string, CustomHostnameState>();
  readonly calls: string[] = [];
  failCreateWith: ProviderError | null = null;

  private make(hostname: string): CustomHostnameState {
    return {
      id: `cf-${hostname}-${this.hostnames.size + 1}`,
      hostname,
      status: "pending",
      sslStatus: "pending_validation",
      verificationErrors: [],
      validationErrors: [],
      certIssuedAt: null,
      certExpiresAt: null,
    };
  }
  /** Simulates a hostname left behind by an earlier crash. */
  seed(hostname: string): CustomHostnameState {
    const state = this.make(hostname);
    this.hostnames.set(state.id, state);
    return state;
  }
  setLive(id: string) {
    const state = this.hostnames.get(id)!;
    Object.assign(state, { status: "active", sslStatus: "active", certIssuedAt: new Date("2026-10-05"), certExpiresAt: new Date("2027-01-03") });
  }
  async create(hostname: string) {
    this.calls.push(`create ${hostname}`);
    if (this.failCreateWith) throw this.failCreateWith;
    if ([...this.hostnames.values()].some((h) => h.hostname === hostname)) {
      throw new ProviderError("duplicate", "Duplicate custom hostname found.", 409);
    }
    return this.seed(hostname);
  }
  async findByHostname(hostname: string) {
    this.calls.push(`find ${hostname}`);
    return [...this.hostnames.values()].find((h) => h.hostname === hostname) ?? null;
  }
  async get(id: string) {
    this.calls.push(`get ${id}`);
    const state = this.hostnames.get(id);
    return state ? { ...state } : null;
  }
  async revalidate(id: string) {
    this.calls.push(`revalidate ${id}`);
    const state = this.hostnames.get(id);
    if (!state) throw new ProviderError("not_found", "gone", 404);
    return { ...state };
  }
  async delete(id: string) {
    this.calls.push(`delete ${id}`);
    this.hostnames.delete(id);
  }
  async count() {
    return this.hostnames.size;
  }
  isLive(state: CustomHostnameState) {
    return state.status === "active" && state.sslStatus === "active";
  }
  isBlocked(state: CustomHostnameState) {
    return state.status === "blocked";
  }
  needsRevalidation(state: CustomHostnameState) {
    return state.status === "moved" || state.sslStatus === "validation_timed_out";
  }
}

export class FakeDns implements DnsLookup {
  txt = new Map<string, string[][]>();
  cname = new Map<string, string[]>();
  a = new Map<string, string[]>();
  readonly queried: string[] = [];
  private lookup<T>(map: Map<string, T[]>, name: string): Promise<T[]> {
    this.queried.push(name);
    const value = map.get(name);
    if (!value) return Promise.reject(Object.assign(new Error("ENODATA"), { code: "ENODATA" }));
    return Promise.resolve(value);
  }
  resolveTxt(name: string) {
    return this.lookup(this.txt, name);
  }
  resolveCname(name: string) {
    return this.lookup(this.cname, name);
  }
  resolve4(name: string) {
    return this.lookup(this.a, name);
  }
  resolve6(name: string) {
    return this.lookup(new Map<string, string[]>(), name);
  }
}

export class FakeProber implements HttpsProber {
  responses = new Map<string, ProbeResponse>();
  async get(url: string) {
    return this.responses.get(url) ?? null;
  }
  serve(hostname: string, deploymentId: string | null) {
    this.responses.set(`https://${hostname}/__useframe/health`, { status: 200, headers: {}, body: "useframe-ok" });
    if (deploymentId) {
      this.responses.set(`https://${hostname}/`, {
        status: 200,
        headers: { "x-useframe-deployment": deploymentId },
        body: "<h1>site</h1>",
      });
    }
  }
}

export class FakeScratch implements DomainScratch {
  readonly observations = new Map<string, Observation>();
  readonly stamps = new Set<string>();
  readonly counters = new Map<string, number>();
  async getObservation(id: string) {
    return this.observations.get(id) ?? null;
  }
  async setObservation(id: string, o: Observation) {
    this.observations.set(id, o);
  }
  async claim(key: string) {
    if (this.stamps.has(key)) return false;
    this.stamps.add(key);
    return true;
  }
  async incr(key: string) {
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    return n;
  }
  async clear(key: string) {
    this.counters.delete(key);
  }
}

export const CONFIG: DomainConfig = {
  baseDomain: "useframe.in",
  reservedHosts: ["useframe.in", "www.useframe.in", "api.useframe.in"],
  blocklist: ["evil.example"],
  edgeTarget: "cname.useframe.in",
  capacityLimit: 100,
  ownershipWindowMs: 72 * 3600_000,
  routingWindowMs: 7 * 86_400_000,
};

export type Harness = ReturnType<typeof createHarness>;

export function createHarness(options: { deployed?: boolean } = {}) {
  const db = new FakeDb();
  const provider = new FakeProvider();
  const dns = new FakeDns();
  const prober = new FakeProber();
  const scratch = new FakeScratch();
  const kv = new Map<string, string | null>();
  const syncCalls: { siteId: string; deleteHosts?: string[] }[] = [];
  const redeploys: { projectId: string; versionId: string; siteUrl: string }[] = [];
  const scheduled: { domainId: string; delayMs: number }[] = [];
  const alerts: string[] = [];
  let clock = new Date("2026-10-05T00:00:00Z").getTime();
  let redeployResult: RedeployResult = "queued";

  const project = { id: "p1", userId: "u1", name: "Acme" };
  db.tables.project.push({ ...project, deletedAt: null });
  db.tables.project.push({ id: "p2", userId: "u2", name: "Other", deletedAt: null });
  db.tables.projectSite.push({
    id: "s1",
    projectId: "p1",
    subdomainLabel: "acme-x7k",
    defaultHost: "acme-x7k.useframe.in",
    primaryHost: "acme-x7k.useframe.in",
    activeDeploymentId: options.deployed ? "d1" : null,
    suspendedAt: null,
  });
  db.tables.projectSite.push({
    id: "s2",
    projectId: "p2",
    subdomainLabel: "other-b2c",
    defaultHost: "other-b2c.useframe.in",
    primaryHost: "other-b2c.useframe.in",
    activeDeploymentId: null,
    suspendedAt: null,
  });
  if (options.deployed) {
    db.tables.deployment.push({
      id: "d1",
      projectId: "p1",
      siteId: "s1",
      versionId: "v1",
      status: "LIVE",
      framework: "VITE_SPA",
      triggeredBy: "user",
      siteUrl: "https://acme-x7k.useframe.in",
      createdAt: new Date(clock - 3600_000),
    });
  }

  const deps: DomainDeps = {
    db: db as never,
    provider,
    dns,
    prober,
    scratch,
    config: CONFIG,
    // Real Stage 1 desired-state derivation over the fake DB.
    async syncSite(siteId, opts) {
      syncCalls.push({ siteId, deleteHosts: opts?.deleteHosts });
      const state = await loadSiteState(db as never, siteId);
      for (const [host, value] of computeDesiredEntries(state, opts?.deleteHosts)) {
        if (value) kv.set(`h:${host}`, JSON.stringify(value));
        else kv.delete(`h:${host}`);
      }
    },
    async readKv(key) {
      return kv.get(key) ?? null;
    },
    async requestRedeploy(input) {
      if (redeployResult !== "queued") return redeployResult;
      const site = db.tables.projectSite.find((s) => s.projectId === input.projectId)!;
      const siteUrl = `https://${site.primaryHost}`;
      redeploys.push({ projectId: input.projectId, versionId: input.versionId, siteUrl });
      db.tables.deployment.push({
        id: `sys${redeploys.length}`,
        projectId: input.projectId,
        siteId: site.id,
        versionId: input.versionId,
        status: "QUEUED",
        triggeredBy: "domain_change",
        siteUrl,
        createdAt: new Date(clock),
      });
      return "queued";
    },
    async schedule(domainId, delayMs) {
      scheduled.push({ domainId, delayMs });
    },
    alert(message) {
      alerts.push(message);
    },
    now: () => new Date(clock),
  };

  return {
    deps,
    db,
    provider,
    dns,
    prober,
    scratch,
    kv,
    syncCalls,
    redeploys,
    scheduled,
    alerts,
    advance(ms: number) {
      clock += ms;
    },
    setRedeployResult(result: RedeployResult) {
      redeployResult = result;
    },
    domain(id: string) {
      return db.tables.customDomain.find((d) => d.id === id) as Row & Record<string, any>;
    },
    site() {
      return db.tables.projectSite.find((s) => s.id === "s1") as Row & Record<string, any>;
    },
    publishTxt(hostname: string, token: string, chunks = 1) {
      const value = `useframe-site-verification=${token}`;
      const size = Math.ceil(value.length / chunks);
      dns.txt.set(`_useframe-challenge.${hostname}`, [
        Array.from({ length: chunks }, (_, i) => value.slice(i * size, (i + 1) * size)),
      ]);
    },
  };
}
