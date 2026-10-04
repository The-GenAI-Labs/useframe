import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { parse } from "tldts";

export type HostnameErrorCode =
  | "empty"
  | "invalid_hostname"
  | "ip_address"
  | "localhost"
  | "wildcard"
  | "has_port"
  | "invalid_characters"
  | "label_too_long"
  | "too_long"
  | "public_suffix"
  | "platform_domain"
  | "reserved_host"
  | "provider_domain"
  | "blocked_domain";

const MESSAGES: Record<HostnameErrorCode, string> = {
  empty: "Enter a domain, for example www.example.com.",
  invalid_hostname: "That doesn't look like a valid domain name.",
  ip_address: "Enter a domain name, not an IP address.",
  localhost: "localhost can't be connected.",
  wildcard: "Wildcard domains (*.example.com) aren't supported. Enter one specific domain.",
  has_port: "Remove the port number; enter just the domain.",
  invalid_characters: "Domains can only contain letters, numbers, dots and hyphens.",
  label_too_long: "Each part of a domain can be at most 63 characters.",
  too_long: "That domain is too long (maximum 253 characters).",
  public_suffix: "Enter a domain you own, such as example.com or www.example.com — not just an ending like .com.",
  platform_domain: "Your site already has a useframe address; connect a domain you own instead.",
  reserved_host: "That address is reserved and can't be connected.",
  provider_domain: "Domains on hosting-provider addresses can't be connected. Use a domain you own.",
  blocked_domain: "This domain can't be connected. Contact support if you think this is a mistake.",
};

// Hosts under these belong to our infrastructure provider, never to a customer.
const PROVIDER_SUFFIXES = ["workers.dev", "pages.dev", "r2.dev", "cloudflarestorage.com", "cloudflare.com"];

export type HostnameRules = { baseDomain: string; reservedHosts: string[]; blocklist: string[] };

export type ValidHostname = {
  ok: true;
  hostname: string;
  registrableDomain: string;
  subdomain: string;
  isApex: boolean;
};

export type InvalidHostname = { ok: false; code: HostnameErrorCode; message: string };

const fail = (code: HostnameErrorCode): InvalidHostname => ({ ok: false, code, message: MESSAGES[code] });

const isUnder = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

// Strips what users commonly paste around a domain: scheme, path, query, trailing dot.
export function normalizeInput(input: string): string {
  return input
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
    .split(/[/?#]/)[0]!
    .replace(/\.$/, "")
    .toLowerCase();
}

export function validateHostname(input: string, rules: HostnameRules): ValidHostname | InvalidHostname {
  const raw = normalizeInput(input);
  if (!raw) return fail("empty");
  if (/\s/.test(raw)) return fail("invalid_characters");
  if (raw.includes("*")) return fail("wildcard");
  if (isIP(raw) || isIP(raw.replace(/^\[|\]$/g, ""))) return fail("ip_address");
  if (raw.includes(":")) return fail("has_port");
  if (raw.includes("_")) return fail("invalid_characters");

  const hostname = domainToASCII(raw);
  if (!hostname) return fail("invalid_hostname");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return fail("localhost");
  if (hostname.length > 253) return fail("too_long");
  const labels = hostname.split(".");
  if (labels.some((l) => l.length > 63)) return fail("label_too_long");
  if (labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(l))) return fail("invalid_hostname");

  const parsed = parse(hostname, { allowPrivateDomains: false });
  if (parsed.isIp) return fail("ip_address");
  if (!parsed.domain || !parsed.publicSuffix || hostname === parsed.publicSuffix) return fail("public_suffix");

  if (isUnder(hostname, rules.baseDomain)) return fail("platform_domain");
  if (rules.reservedHosts.includes(hostname)) return fail("reserved_host");
  if (PROVIDER_SUFFIXES.some((s) => isUnder(hostname, s))) return fail("provider_domain");
  if (rules.blocklist.some((b) => isUnder(hostname, b))) return fail("blocked_domain");

  return {
    ok: true,
    hostname,
    registrableDomain: parsed.domain,
    subdomain: parsed.subdomain ?? "",
    isApex: !parsed.subdomain,
  };
}
