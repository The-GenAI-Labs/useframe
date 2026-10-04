import { describe, expect, it, vi } from "vitest";
import { CloudflareKv, KvApiError } from "@/lib/cloudflareKv.js";

const TOKEN = "super-secret-token";

function client(responses: (() => Response)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("unexpected request");
    return next();
  });
  const kv = new CloudflareKv({
    accountId: "acct",
    namespaceId: "ns",
    apiToken: TOKEN,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    baseDelayMs: 1,
  });
  return { kv, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("CloudflareKv", () => {
  it("PUTs the raw value with a bearer token", async () => {
    const { kv, calls } = client([json({ success: true })]);
    await kv.put("h:acme.useframe.in", '{"v":1,"t":"x"}');
    expect(calls[0]!.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct/storage/kv/namespaces/ns/values/h%3Aacme.useframe.in",
    );
    expect(calls[0]!.init.method).toBe("PUT");
    expect(calls[0]!.init.body).toBe('{"v":1,"t":"x"}');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("returns null for a missing key", async () => {
    const { kv } = client([json({ success: false }, 404)]);
    expect(await kv.get("h:none")).toBeNull();
  });

  it("retries 429 honoring Retry-After, then succeeds", async () => {
    const { kv, calls } = client([json({ success: false }, 429, { "retry-after": "0" }), json({ success: true })]);
    await kv.delete("h:x");
    expect(calls).toHaveLength(2);
  });

  it("does not retry a 4xx and never puts the token in the error", async () => {
    const { kv, calls } = client([json({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }, 403)]);
    const err = await kv.put("h:x", "v").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KvApiError);
    expect((err as KvApiError).status).toBe(403);
    expect(String((err as Error).message)).not.toContain(TOKEN);
    expect(calls).toHaveLength(1);
  });

  it("follows list cursors", async () => {
    const { kv, calls } = client([
      json({ success: true, result: [{ name: "h:a" }], result_info: { cursor: "c1" } }),
      json({ success: true, result: [{ name: "h:b" }], result_info: { cursor: "" } }),
    ]);
    expect(await kv.listKeys("h:")).toEqual(["h:a", "h:b"]);
    expect(calls[1]!.url).toContain("cursor=c1");
  });

  it("retries only the keys a bulk write reports as unsuccessful", async () => {
    const { kv, calls } = client([
      json({ success: true, result: { successful_key_count: 1, unsuccessful_keys: ["h:b"] } }),
      json({ success: true, result: { successful_key_count: 1, unsuccessful_keys: [] } }),
    ]);
    await kv.bulkPut([
      { key: "h:a", value: "1" },
      { key: "h:b", value: "2" },
    ]);
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual([{ key: "h:b", value: "2" }]);
  });

  it("uses POST /bulk/delete with a JSON array of keys", async () => {
    const { kv, calls } = client([json({ success: true, result: { unsuccessful_keys: [] } })]);
    await kv.bulkDelete(["h:a"]);
    expect(calls[0]!.url).toMatch(/\/bulk\/delete$/);
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual(["h:a"]);
  });
});
