import type { SiteKvValue } from "./kvContract.js";

export type SiteState = {
  defaultHost: string;
  primaryHost: string;
  suspended: boolean;
  active: { projectId: string; deploymentId: string; mode: "n" | "s" } | null;
};

export type DesiredEntries = Map<string, SiteKvValue | null>;

// Hosts are data: Stage 2 adds a custom domain by making it primaryHost, and
// passes hosts the site no longer owns in deleteHosts.
export function computeDesiredEntries(site: SiteState, deleteHosts: string[] = []): DesiredEntries {
  const entries: DesiredEntries = new Map();
  for (const host of deleteHosts) entries.set(host.toLowerCase(), null);

  const serve: SiteKvValue | null = site.active
    ? { v: 1, t: "p", k: `${site.active.projectId}/${site.active.deploymentId}`, m: site.active.mode }
    : null;
  const hosts = new Set([site.defaultHost, site.primaryHost].map((h) => h.toLowerCase()));

  for (const host of hosts) {
    if (site.suspended) entries.set(host, { v: 1, t: "x" });
    else if (host === site.primaryHost.toLowerCase()) entries.set(host, serve);
    else entries.set(host, { v: 1, t: "r", u: `https://${site.primaryHost.toLowerCase()}` });
  }
  return entries;
}

export type WritePlan = { puts: [string, SiteKvValue][]; deletes: string[] };

// KV has no multi-key transaction: serve entries land before anything that
// redirects to them, and deletes come last.
export function orderWrites(entries: DesiredEntries): WritePlan {
  const rank = (v: SiteKvValue) => (v.t === "p" ? 0 : v.t === "x" ? 1 : 2);
  const puts = [...entries]
    .filter((e): e is [string, SiteKvValue] => e[1] !== null)
    .sort((a, b) => rank(a[1]) - rank(b[1]));
  const deletes = [...entries].filter(([, v]) => v === null).map(([h]) => h);
  return { puts, deletes };
}
