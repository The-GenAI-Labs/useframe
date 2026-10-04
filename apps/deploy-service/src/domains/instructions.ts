import { parse } from "tldts";
import { isRetryable } from "./failures.js";

// What the user must publish to prove ownership and route traffic. Together with
// the provider implementation, this is the only place that knows the validation method.
export const OWNERSHIP_LABEL = "_useframe-challenge";
export const OWNERSHIP_VALUE_PREFIX = "useframe-site-verification=";

export const ownershipRecordName = (hostname: string) => `${OWNERSHIP_LABEL}.${hostname}`;
export const ownershipRecordValue = (token: string) => `${OWNERSHIP_VALUE_PREFIX}${token}`;

export const CAA_RECORDS = [
  "letsencrypt.org",
  "pki.goog; cansignhttpexchanges=yes",
  "ssl.com",
  "sectigo.com",
] as const;

export const CAA_HINT =
  "Your DNS has CAA records that don't allow Cloudflare's certificate authorities. Add CAA records " +
  `(tag "issue") for ${CAA_RECORDS.map((r) => `"${r}"`).join(", ")}, or remove the restrictive ones.`;

export type Observation = {
  ownership?: "found" | "not_found" | "wrong_value";
  txtFound?: string[];
  resolvesTo?: string[];
  pointsAtEdge?: boolean;
  certificateHint?: string | null;
};

export type DomainRow = {
  id: string;
  domain: string;
  status: string;
  ownershipToken: string | null;
  ownershipVerifiedAt: Date | null;
  isApex: boolean;
  sslStatus: string | null;
  failureReason: string | null;
  failureCode: string | null;
  lastCheckedAt: Date | null;
};

export type DnsRecord = { type: "TXT" | "CNAME"; name: string; relativeName: string; value: string };

export type Instructions = {
  id: string;
  hostname: string;
  registrableDomain: string;
  isApex: boolean;
  status: string;
  steps: [
    { id: "ownership"; state: "pending" | "found" | "wrong_value" | "done"; record: DnsRecord },
    { id: "routing"; state: "waiting" | "pending" | "found" | "done"; record: DnsRecord },
  ];
  currentDns: { resolvesTo: string[]; txtFound: string[] };
  certificate: { status: string | null; hint: string | null };
  failureReason: string | null;
  retryable: boolean;
  warning: string | null;
  lastCheckedAt: string | null;
  apexAdvice: string | null;
  notes: string[];
};

export const NOTES = [
  "DNS changes can take from a few minutes up to an hour (occasionally longer).",
  "Add the TXT record first. Add the CNAME only after Step 1 shows ✓ — the CNAME is what moves your traffic, so it goes last.",
  "You can delete the TXT record once Step 1 shows ✓; keep the CNAME.",
  "If your DNS is on Cloudflare, we recommend setting the CNAME to DNS only (grey cloud).",
  "The security certificate is issued automatically after the CNAME resolves — usually within a few minutes. If this domain currently serves another website, visitors may see a certificate warning for a few minutes after you switch the record.",
];

export const APEX_ADVICE =
  "Most DNS hosts can't point a bare domain (like example.com) at a website service. We recommend " +
  "connecting www.<your domain> instead and turning on your registrar's domain forwarding from the bare " +
  "domain to www. If your DNS host offers ALIAS, ANAME or CNAME flattening, you can point the bare domain " +
  "at the CNAME target below instead. HTTPS on the bare domain then depends on your registrar's forwarding service.";

const stripDot = (v: string) => v.replace(/\.$/, "");

export function recordNames(hostname: string) {
  const parsed = parse(hostname, { allowPrivateDomains: false });
  const sub = parsed.subdomain ?? "";
  return {
    registrableDomain: parsed.domain ?? hostname,
    routingRelative: sub || "@",
    ownershipRelative: sub ? `${OWNERSHIP_LABEL}.${sub}` : OWNERSHIP_LABEL,
  };
}

// Sanitized, user-facing explanation of certificate/ownership validation errors.
export function certificateHint(errors: string[]): string | null {
  if (errors.length === 0) return null;
  const text = errors.join(" ").toLowerCase();
  if (text.includes("caa")) return CAA_HINT;
  if (/cname|not point|no such host|nxdomain|dns/.test(text)) {
    return "The certificate can't be issued until your CNAME record points to UseFrame.";
  }
  return "The certificate authority couldn't validate your domain yet. This usually clears up once the CNAME has propagated.";
}

export function buildInstructions(
  row: DomainRow,
  edgeTarget: string,
  observation: Observation = {},
): Instructions {
  const names = recordNames(row.domain);
  const proven = !!row.ownershipVerifiedAt;
  const active = row.status === "ACTIVE";

  const ownershipState = proven
    ? "done"
    : observation.ownership === "found" || observation.ownership === "wrong_value"
      ? observation.ownership
      : "pending";
  const routingState = !proven ? "waiting" : active ? "done" : observation.pointsAtEdge ? "found" : "pending";
  const failed = row.status === "FAILED";

  return {
    id: row.id,
    hostname: row.domain,
    registrableDomain: names.registrableDomain,
    isApex: row.isApex,
    status: row.status,
    steps: [
      {
        id: "ownership",
        state: ownershipState,
        record: {
          type: "TXT",
          name: ownershipRecordName(row.domain),
          relativeName: names.ownershipRelative,
          value: ownershipRecordValue(row.ownershipToken ?? ""),
        },
      },
      {
        id: "routing",
        state: routingState,
        record: {
          type: "CNAME",
          name: row.domain,
          relativeName: names.routingRelative,
          value: stripDot(edgeTarget),
        },
      },
    ],
    currentDns: {
      resolvesTo: (observation.resolvesTo ?? []).map(stripDot),
      txtFound: observation.txtFound ?? [],
    },
    certificate: { status: row.sslStatus, hint: observation.certificateHint ?? null },
    failureReason: failed ? row.failureReason : null,
    retryable: failed && isRetryable(row.failureCode),
    // While ACTIVE, failureReason carries the daily healthcheck's warning.
    warning: active ? row.failureReason : null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    apexAdvice: row.isApex ? APEX_ADVICE : null,
    notes: NOTES,
  };
}
