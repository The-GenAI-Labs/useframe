import { describe, expect, it, vi } from "vitest";

const resolverCalls = vi.hoisted(() => ({ servers: [] as string[][], options: [] as unknown[] }));
vi.mock("node:dns/promises", async (original) => ({
  ...(await original<typeof import("node:dns/promises")>()),
  Resolver: class {
    constructor(options: unknown) {
      resolverCalls.options.push(options);
    }
    setServers(servers: string[]) {
      resolverCalls.servers.push(servers);
    }
  },
}));

const { validateHostname, normalizeInput } = await import("@/domains/hostname.js");
const { buildInstructions, certificateHint, CAA_HINT, recordNames, NOTES } = await import("@/domains/instructions.js");
const { checkTxtRecord, createExplicitResolver, observeRouting } = await import("@/domains/dns.js");
const { FakeDns, CONFIG } = await import("./fakes.js");

const rules = { baseDomain: CONFIG.baseDomain, reservedHosts: CONFIG.reservedHosts, blocklist: CONFIG.blocklist };

describe("hostname validation", () => {
  it("normalizes a pasted URL", () => {
    expect(normalizeInput("  https://www.Acme.com/pricing?x=1#top ")).toBe("www.acme.com");
    const result = validateHostname("https://www.Acme.com/", rules);
    expect(result).toMatchObject({ ok: true, hostname: "www.acme.com", registrableDomain: "acme.com", isApex: false });
  });

  it("converts IDNs to punycode", () => {
    expect(validateHostname("www.bücher.de", rules)).toMatchObject({ ok: true, hostname: "www.xn--bcher-kva.de" });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["192.168.1.10", "ip_address"],
    ["[::1]", "ip_address"],
    ["localhost", "localhost"],
    ["app.localhost", "localhost"],
    ["*.acme.com", "wildcard"],
    ["www.acme.com:8080", "has_port"],
    ["my_site.acme.com", "invalid_characters"],
    ["my site.com", "invalid_characters"],
    [`${"a".repeat(64)}.com`, "label_too_long"],
    [`${"abcdefghij.".repeat(25)}com`, "too_long"],
    ["-bad.acme.com", "invalid_hostname"],
    ["com", "public_suffix"],
    ["co.uk", "public_suffix"],
    ["useframe.in", "platform_domain"],
    ["shop.acme-x7k.useframe.in", "platform_domain"],
    ["my.workers.dev", "provider_domain"],
    ["x.pages.dev", "provider_domain"],
    ["bucket.r2.dev", "provider_domain"],
    ["acct.r2.cloudflarestorage.com", "provider_domain"],
    ["dash.cloudflare.com", "provider_domain"],
    ["www.evil.example", "blocked_domain"],
  ])("rejects %j as %s", (input, code) => {
    const result = validateHostname(input, rules);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(code);
      expect(result.message.length).toBeGreaterThan(10);
    }
  });

  it("rejects reserved hosts", () => {
    const result = validateHostname("status.acme.com", { ...rules, reservedHosts: ["status.acme.com"] });
    expect(result).toMatchObject({ ok: false, code: "reserved_host" });
  });

  it("marks apex domains", () => {
    expect(validateHostname("acme.co.uk", rules)).toMatchObject({ ok: true, isApex: true, registrableDomain: "acme.co.uk" });
  });
});

const row = (domain: string, extra: Record<string, unknown> = {}) => ({
  id: "dom1",
  domain,
  status: "AWAITING_OWNERSHIP_TXT",
  ownershipToken: "abc123",
  ownershipVerifiedAt: null as Date | null,
  isApex: false,
  sslStatus: null,
  failureReason: null,
  failureCode: null,
  lastCheckedAt: null,
  ...extra,
});

describe("DNS instructions", () => {
  it.each([
    ["www.acme.com", "acme.com", "www", "_useframe-challenge.www"],
    ["shop.acme.co.uk", "acme.co.uk", "shop", "_useframe-challenge.shop"],
    ["acme.com", "acme.com", "@", "_useframe-challenge"],
    ["acme.co.uk", "acme.co.uk", "@", "_useframe-challenge"],
    ["www.xn--bcher-kva.de", "xn--bcher-kva.de", "www", "_useframe-challenge.www"],
  ])("%s → registrable %s, relative %s / %s", (hostname, registrable, routing, ownership) => {
    expect(recordNames(hostname)).toEqual({
      registrableDomain: registrable,
      routingRelative: routing,
      ownershipRelative: ownership,
    });
  });

  it("orders TXT before CNAME, strips trailing dots, waits on routing until ownership is proven", () => {
    const pending = buildInstructions(row("www.acme.com"), "cname.useframe.in.", { resolvesTo: ["old.host.net."] });
    expect(pending.steps.map((s) => s.id)).toEqual(["ownership", "routing"]);
    expect(pending.steps[0].record).toEqual({
      type: "TXT",
      name: "_useframe-challenge.www.acme.com",
      relativeName: "_useframe-challenge.www",
      value: "useframe-site-verification=abc123",
    });
    expect(pending.steps[1]).toMatchObject({
      state: "waiting",
      record: { type: "CNAME", name: "www.acme.com", relativeName: "www", value: "cname.useframe.in" },
    });
    expect(pending.currentDns.resolvesTo).toEqual(["old.host.net"]);
    expect(pending.apexAdvice).toBeNull();
    expect(pending.notes).toEqual(NOTES);

    const proven = buildInstructions(
      row("www.acme.com", { ownershipVerifiedAt: new Date(), status: "AWAITING_ROUTING_DNS" }),
      "cname.useframe.in",
      { pointsAtEdge: true },
    );
    expect(proven.steps[0].state).toBe("done");
    expect(proven.steps[1].state).toBe("found");
  });

  it("surfaces TXT found / wrong value states", () => {
    expect(buildInstructions(row("www.acme.com"), "cname.useframe.in", { ownership: "wrong_value" }).steps[0].state).toBe("wrong_value");
  });

  it("gives apex advice only for apex domains", () => {
    expect(buildInstructions(row("acme.com", { isApex: true }), "cname.useframe.in").apexAdvice).toContain("www");
    expect(buildInstructions(row("www.acme.com"), "cname.useframe.in").apexAdvice).toBeNull();
  });

  it("reports failures with retryability", () => {
    const failed = buildInstructions(
      row("www.acme.com", { status: "FAILED", failureCode: "ownership_timeout", failureReason: "We never found the verification record." }),
      "cname.useframe.in",
    );
    expect(failed).toMatchObject({ retryable: true, failureReason: "We never found the verification record." });
    const blocked = buildInstructions(row("x.com", { status: "FAILED", failureCode: "blocked", failureReason: "x" }), "c");
    expect(blocked.retryable).toBe(false);
  });

  it("turns validation errors into sanitized hints, with exact CAA guidance", () => {
    expect(certificateHint([])).toBeNull();
    expect(certificateHint(['{"code":1,"message":"CAA record prevents issuance"}'])).toBe(CAA_HINT);
    expect(CAA_HINT).toContain("letsencrypt.org");
    expect(CAA_HINT).toContain("pki.goog; cansignhttpexchanges=yes");
    expect(certificateHint(["random internal stuff {json}"])).not.toContain("{");
  });
});

describe("DNS checks", () => {
  it("uses explicit resolvers, never the system resolver", () => {
    createExplicitResolver(["1.1.1.1", "8.8.8.8"]);
    expect(resolverCalls.servers.at(-1)).toEqual(["1.1.1.1", "8.8.8.8"]);
  });

  it.each([
    [[["useframe-site-verification=tok"]], "found"],
    [[["useframe-site-verif", "ication=tok"]], "found"],
    [[["v=spf1 -all"], ["useframe-site-verification=other"]], "wrong_value"],
    [[["v=spf1 -all"]], "not_found"],
  ])("TXT %j → %s", async (records, state) => {
    const dns = new FakeDns();
    dns.txt.set("_useframe-challenge.www.acme.com", records);
    const result = await checkTxtRecord(dns, "_useframe-challenge.www.acme.com", "useframe-site-verification=tok", "useframe-site-verification=");
    expect(result.state).toBe(state);
  });

  it("treats a missing record as not found", async () => {
    const result = await checkTxtRecord(new FakeDns(), "_x.acme.com", "v", "p");
    expect(result).toEqual({ state: "not_found", values: [] });
  });

  it("reports where a domain points", async () => {
    const dns = new FakeDns();
    dns.cname.set("www.acme.com", ["cname.useframe.in."]);
    expect(await observeRouting(dns, "www.acme.com", "cname.useframe.in")).toEqual({
      resolvesTo: ["cname.useframe.in"],
      pointsAtEdge: true,
    });
    dns.cname.delete("www.acme.com");
    dns.a.set("www.acme.com", ["203.0.113.9"]);
    expect(await observeRouting(dns, "www.acme.com", "cname.useframe.in")).toEqual({
      resolvesTo: ["203.0.113.9"],
      pointsAtEdge: false,
    });
  });
});
