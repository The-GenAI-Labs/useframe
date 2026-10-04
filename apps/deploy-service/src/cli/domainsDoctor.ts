import { env } from "@/config/env.js";
import { closeContext, domainProvider } from "@/context.js";
import { createExplicitResolver, observeRouting } from "@/domains/dns.js";

type Status = "PASS" | "FAIL" | "WARN";
let failed = false;
const report = (check: string, status: Status, detail: string) => {
  if (status === "FAIL") failed = true;
  console.log(`${status.padEnd(4)}  ${check} — ${detail}`);
};

console.log(`Custom domains feature flag: ${env.CUSTOM_DOMAINS_ENABLED ? "ON" : "OFF"}\n`);

if (!domainProvider) {
  report("Cloudflare for SaaS", "FAIL", "CLOUDFLARE_ZONE_ID is not set");
} else {
  try {
    const count = await domainProvider.count();
    report("Cloudflare for SaaS reachable with the runtime token", "PASS", `${count} custom hostnames on the zone`);
    const limit = env.CUSTOM_DOMAIN_CAPACITY_LIMIT;
    report(
      "Hostname count vs CUSTOM_DOMAIN_CAPACITY_LIMIT",
      count >= limit ? "FAIL" : count >= limit * 0.8 ? "WARN" : "PASS",
      `${count} / ${limit}`,
    );
  } catch (err) {
    report("Cloudflare for SaaS reachable with the runtime token", "FAIL", err instanceof Error ? err.message : String(err));
  }

  const expectedOrigin = `fallback.${env.SITES_BASE_DOMAIN}`;
  try {
    const fallback = await domainProvider.fallbackOrigin();
    const ok = fallback.origin === expectedOrigin && fallback.status === "active";
    report(
      "Fallback origin",
      ok ? "PASS" : "FAIL",
      `origin=${fallback.origin ?? "none"} status=${fallback.status ?? "none"} (expected ${expectedOrigin}, active)`,
    );
  } catch (err) {
    report("Fallback origin", "FAIL", err instanceof Error ? err.message : String(err));
  }
}

const routing = await observeRouting(
  createExplicitResolver(env.DNS_RESOLVERS),
  env.SITES_EDGE_CNAME_TARGET,
  `fallback.${env.SITES_BASE_DOMAIN}`,
);
report(
  `SITES_EDGE_CNAME_TARGET (${env.SITES_EDGE_CNAME_TARGET}) resolves`,
  routing.resolvesTo.length ? "PASS" : "FAIL",
  routing.resolvesTo.join(", ") || "no records",
);

await closeContext();
process.exit(failed ? 1 : 0);
