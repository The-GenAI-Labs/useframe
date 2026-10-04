// Run against the real Cloudflare account (you add DNS records when prompted):
//   SPIKE_CUSTOM_HOSTNAME=www.<a domain you control> pnpm --filter @useframe/deploy-service spike:domains
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { env } from "@/config/env.js";
import { closeContext, deps, domainProvider } from "@/context.js";
import { checkTxtRecord, createExplicitResolver, observeRouting } from "@/domains/dns.js";
import { validateHostname } from "@/domains/hostname.js";
import {
  OWNERSHIP_VALUE_PREFIX,
  ownershipRecordName,
  ownershipRecordValue,
  recordNames,
} from "@/domains/instructions.js";
import { fetchProber } from "@/domains/prober.js";
import { deletePrefix, uploadFile } from "@/lib/r2.js";
import { sleep } from "@/lib/retry.js";

type Status = "PASS" | "FAIL" | "WARN";
const results: { check: string; status: Status; detail: string }[] = [];
const report = (check: string, status: Status, detail: string) => {
  results.push({ check, status, detail });
  console.log(`${status.padEnd(4)}  ${check} — ${detail}`);
};

const input = process.env.SPIKE_CUSTOM_HOSTNAME;
if (!input || !domainProvider) {
  console.error("Set SPIKE_CUSTOM_HOSTNAME and CLOUDFLARE_ZONE_ID (feature flag not required).");
  process.exit(2);
}
const parsed = validateHostname(input, {
  baseDomain: env.SITES_BASE_DOMAIN,
  reservedHosts: env.SITES_RESERVED_HOSTS,
  blocklist: env.CUSTOM_DOMAIN_BLOCKLIST,
});
if (!parsed.ok) {
  console.error(`SPIKE_CUSTOM_HOSTNAME rejected: ${parsed.message}`);
  process.exit(2);
}

const hostname = parsed.hostname;
const provider = domainProvider;
const dns = createExplicitResolver(env.DNS_RESOLVERS);
const names = recordNames(hostname);
const rand = randomBytes(4).toString("hex");
const token = randomBytes(16).toString("hex");
const deploymentId = `${rand}-dom`;
let hostnameId: string | null = null;

async function waitFor<T>(label: string, timeoutMs: number, poll: () => Promise<T | null>): Promise<{ value: T; ms: number } | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await poll();
    if (value !== null) return { value, ms: Date.now() - started };
    process.stdout.write(`  … waiting for ${label} (${Math.round((Date.now() - started) / 1000)} s)\r`);
    await sleep(10_000);
  }
  return null;
}

const dir = await mkdtemp(path.join(os.tmpdir(), "useframe-spike-domains-"));
try {
  console.log(`\nStep 1 — add this TXT record at your DNS host:\n  name:  ${ownershipRecordName(hostname)}  (relative: ${names.ownershipRelative})\n  value: ${ownershipRecordValue(token)}\n`);
  const txt = await waitFor("TXT record", 60 * 60_000, async () => {
    const check = await checkTxtRecord(dns, ownershipRecordName(hostname), ownershipRecordValue(token), OWNERSHIP_VALUE_PREFIX);
    return check.state === "found" ? check : null;
  });
  if (!txt) throw new Error("TXT record never seen");
  report("1 TXT ownership", "PASS", `found after ${txt.ms} ms via ${env.DNS_RESOLVERS.join(",")}`);

  const created = await provider.create(hostname);
  hostnameId = created.id;
  report(
    "2 create custom hostname (ssl.method http)",
    created.status === "active" ? "WARN" : "PASS",
    `id=${created.id} status=${created.status} ssl=${created.sslStatus}`,
  );

  console.log(`\nStep 2 — add this CNAME record (DNS only if your DNS is on Cloudflare):\n  name:  ${hostname}  (relative: ${names.routingRelative})\n  value: ${env.SITES_EDGE_CNAME_TARGET}\n`);
  const live = await waitFor("hostname + certificate active", 90 * 60_000, async () => {
    const state = await provider.get(created.id);
    return state && provider.isLive(state) ? state : null;
  });
  if (!live) {
    const state = await provider.get(created.id);
    const routing = await observeRouting(dns, hostname, env.SITES_EDGE_CNAME_TARGET);
    const challenge = await fetchProber.get(`http://${hostname}/.well-known/pki-validation/spike-check.txt`, 10_000);
    report(
      "3 status + ssl.status active with the Worker on */*",
      "FAIL",
      JSON.stringify({
        status: state?.status,
        sslStatus: state?.sslStatus,
        validationErrors: state?.validationErrors,
        verificationErrors: state?.verificationErrors,
        resolvesTo: routing.resolvesTo,
        pkiValidationProbe: challenge ? { status: challenge.status, body: challenge.body.slice(0, 200) } : "no response",
      }),
    );
    console.log("\nCheck 3 failed: stop here and report; do not change the design.");
    process.exitCode = 1;
  } else {
    report("3 status + ssl.status active with the Worker on */*", "PASS", `active after ${live.ms} ms`);

    const health = await fetchProber.get(`https://${hostname}/__useframe/health`, 10_000);
    report(
      "4 health over a valid certificate",
      health?.status === 200 && health.body.trim() === "useframe-ok" ? "PASS" : "FAIL",
      health ? `${health.status} ${health.body.slice(0, 40)}` : "no response (TLS or network error)",
    );

    const indexPath = path.join(dir, "index.html");
    await writeFile(indexPath, "<h1>spike custom domain</h1>");
    await uploadFile(deps.r2, `sites/_spike/${deploymentId}/index.html`, indexPath, 28, "text/html; charset=utf-8", "public, max-age=0, must-revalidate");
    await deps.kv.put(`h:${hostname}`, JSON.stringify({ v: 1, t: "p", k: `_spike/${deploymentId}`, m: "n" }));
    const served = await waitFor("spike deployment to serve", 5 * 60_000, async () => {
      const res = await fetchProber.get(`https://${hostname}/`, 10_000);
      return res?.status === 200 && res.headers["x-useframe-deployment"] === deploymentId ? res : null;
    });
    report("5 custom host serves the deployment", served ? "PASS" : "FAIL", served ? `after ${served.ms} ms` : "never served");

    try {
      const revalidated = await provider.revalidate(created.id);
      report("6 revalidate (PATCH)", "PASS", `status=${revalidated.status} ssl=${revalidated.sslStatus}`);
    } catch (err) {
      report("6 revalidate (PATCH)", "FAIL", err instanceof Error ? err.message : String(err));
    }
  }

  await provider.delete(created.id);
  const gone = await waitFor("hostname deletion", 5 * 60_000, async () => ((await provider.get(created.id)) ? null : true));
  report("7 delete", gone ? "PASS" : "FAIL", gone ? `gone after ${gone.ms} ms` : "still present");
  if (gone) hostnameId = null;
} catch (err) {
  report("spike", "FAIL", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  if (hostnameId) await provider.delete(hostnameId).catch(() => undefined);
  await deps.kv.delete(`h:${hostname}`).catch(() => undefined);
  await deletePrefix(deps.r2, `sites/_spike/${deploymentId}/`).catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
  console.log("\nCleaned up the custom hostname, KV key and R2 test data. You can delete the TXT and CNAME records.");
  console.table(results);
  await closeContext();
  process.exit();
}
