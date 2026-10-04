import { Resolver } from "node:dns/promises";

export interface DnsLookup {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
}

// Explicit public resolvers, never the cluster's caching resolver: users expect
// a record they just added to be seen as soon as it's public.
export function createExplicitResolver(servers: string[], timeoutMs = 5000): DnsLookup {
  const resolver = new Resolver({ timeout: timeoutMs, tries: 2 });
  resolver.setServers(servers);
  return resolver;
}

const MISSING = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN", "ESERVFAIL", "ETIMEOUT", "ECONNREFUSED"]);

async function orEmpty<T>(lookup: Promise<T[]>): Promise<T[]> {
  try {
    return await lookup;
  } catch (err) {
    if (err && typeof err === "object" && MISSING.has(String((err as { code?: unknown }).code))) return [];
    throw err;
  }
}

const stripDot = (name: string) => name.replace(/\.$/, "").toLowerCase();

export type OwnershipCheck = { state: "found" | "not_found" | "wrong_value"; values: string[] };

export async function checkTxtRecord(
  dns: DnsLookup,
  name: string,
  expected: string,
  prefix: string,
): Promise<OwnershipCheck> {
  const records = await orEmpty(dns.resolveTxt(name));
  const values = records.map((chunks) => chunks.join("").trim());
  if (values.includes(expected)) return { state: "found", values };
  if (values.some((v) => v.startsWith(prefix))) return { state: "wrong_value", values };
  return { state: "not_found", values };
}

export type RoutingObservation = { resolvesTo: string[]; pointsAtEdge: boolean };

export async function observeRouting(
  dns: DnsLookup,
  hostname: string,
  edgeTarget: string,
): Promise<RoutingObservation> {
  const [cname, a, aaaa] = await Promise.all([
    orEmpty(dns.resolveCname(hostname)),
    orEmpty(dns.resolve4(hostname)),
    orEmpty(dns.resolve6(hostname)),
  ]);
  const cnames = cname.map(stripDot);
  return {
    resolvesTo: [...cnames, ...a, ...aaaa],
    pointsAtEdge: cnames.includes(stripDot(edgeTarget)),
  };
}
