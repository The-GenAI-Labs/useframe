import { describe, expect, it, vi } from "vitest";
import { CloudflareCustomHostnameProvider, SSL_CONFIG } from "@/domains/cloudflareProvider.js";
import { ProviderError } from "@/domains/provider.js";

const TOKEN = "runtime-token-secret";
const BASE = "https://api.cloudflare.com/client/v4/zones/zone1/custom_hostnames";

const raw = (overrides: Record<string, unknown> = {}) => ({
  id: "ch1",
  hostname: "www.acme.com",
  status: "pending",
  ssl: { status: "pending_validation", validation_errors: [{ message: "CAA blocks" }] },
  verification_errors: ["custom hostname does not CNAME to this zone."],
  ...overrides,
});

function provider(responses: (() => Response)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  });
  return {
    calls,
    p: new CloudflareCustomHostnameProvider({
      zoneId: "zone1",
      apiToken: TOKEN,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseDelayMs: 1,
    }),
  };
}

const ok = (result: unknown, extra: Record<string, unknown> = {}) => () =>
  new Response(JSON.stringify({ success: true, errors: [], result, ...extra }), { status: 200 });
const err = (status: number, code: number, message: string, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify({ success: false, errors: [{ code, message }] }), { status, headers });

describe("CloudflareCustomHostnameProvider", () => {
  it("creates with HTTP DCV and no custom_metadata/custom_origin_server, then GETs", async () => {
    const { p, calls } = provider([ok(raw({ ssl: undefined })), ok(raw())]);
    const state = await p.create("www.acme.com");
    expect(calls[0]!.url).toBe(BASE);
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      hostname: "www.acme.com",
      ssl: {
        method: "http",
        type: "dv",
        bundle_method: "ubiquitous",
        wildcard: false,
        settings: { min_tls_version: "1.2", http2: "on", tls_1_3: "on" },
      },
    });
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[1]!.url).toBe(`${BASE}/ch1`);
    expect(state).toMatchObject({
      id: "ch1",
      status: "pending",
      sslStatus: "pending_validation",
      validationErrors: ["CAA blocks"],
      verificationErrors: ["custom hostname does not CNAME to this zone."],
    });
  });

  it("finds by exact hostname", async () => {
    const { p, calls } = provider([ok([raw({ hostname: "shop.www.acme.com" }), raw()])]);
    expect((await p.findByHostname("www.acme.com"))?.id).toBe("ch1");
    expect(calls[0]!.url).toContain("hostname=www.acme.com");
  });

  it("revalidates by PATCHing the same ssl object", async () => {
    const { p, calls } = provider([ok(raw())]);
    await p.revalidate("ch1");
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ ssl: SSL_CONFIG });
  });

  it("treats 404 as gone for get and delete", async () => {
    const { p } = provider([err(404, 1436, "not found"), err(404, 1436, "not found")]);
    expect(await p.get("ch1")).toBeNull();
    await expect(p.delete("ch1")).resolves.toBeUndefined();
  });

  it("counts from result_info", async () => {
    const { p } = provider([ok([raw()], { result_info: { total_count: 42 } })]);
    expect(await p.count()).toBe(42);
  });

  it("retries 429/5xx", async () => {
    const { p, calls } = provider([err(429, 10000, "rate limited"), err(502, 1000, "bad gateway"), ok(raw())]);
    expect((await p.get("ch1"))?.id).toBe("ch1");
    expect(calls).toHaveLength(3);
  });

  it.each([
    [409, 1406, "duplicate"],
    [403, 1405, "quota"],
    [400, 1400, "invalid"],
  ])("maps HTTP %i / code %i to %s without leaking the token", async (status, code, kind) => {
    const { p } = provider([err(status, code, "boom")]);
    const error = await p.create("www.acme.com").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).kind).toBe(kind);
    expect(String((error as Error).message)).not.toContain(TOKEN);
  });

  it("classifies states", async () => {
    const { p } = provider([]);
    const base = { id: "x", hostname: "h", verificationErrors: [], validationErrors: [], certIssuedAt: null, certExpiresAt: null };
    expect(p.isLive({ ...base, status: "active", sslStatus: "active" })).toBe(true);
    expect(p.isLive({ ...base, status: "active", sslStatus: "pending_validation" })).toBe(false);
    expect(p.isBlocked({ ...base, status: "blocked", sslStatus: null })).toBe(true);
    expect(p.needsRevalidation({ ...base, status: "moved", sslStatus: "active" })).toBe(true);
    expect(p.needsRevalidation({ ...base, status: "pending", sslStatus: "validation_timed_out" })).toBe(true);
    expect(p.needsRevalidation({ ...base, status: "pending", sslStatus: "pending_validation" })).toBe(false);
  });
});
