import { closeContext, domainDeps } from "@/context.js";
import { releaseDomain } from "@/domains/service.js";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const domain = arg("--domain");
const reason = arg("--reason");
if (!domain || !reason) {
  console.error('Usage: pnpm deploy:domain:release --domain <hostname> --reason "..."');
  process.exit(2);
}
if (!domainDeps) {
  console.error("Custom domains are disabled (CUSTOM_DOMAINS_ENABLED / CLOUDFLARE_ZONE_ID).");
  process.exit(2);
}
const result = await releaseDomain(domainDeps, domain, reason);
console.log(
  result.released
    ? `Released ${domain} from project ${result.projectId}. Its site is back on its useframe address.`
    : `Teardown of ${domain} started; it finishes in the background (a rebuild was busy).`,
);
await closeContext();
