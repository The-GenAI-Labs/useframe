import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.js";

const NEXT_HOST = "acme-x7k.useframe.in";
const SPA_HOST = "spa-b2c.useframe.in";
const HTML_CC = "public, max-age=0, must-revalidate";

async function put(key: string, body: string, contentType: string, cacheControl?: string) {
  await env.SITES_BUCKET.put(key, body, { httpMetadata: { contentType, cacheControl } });
}

async function call(url: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(url, init) as never, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeEach(async () => {
  await env.SITES_KV.put(`h:${NEXT_HOST}`, JSON.stringify({ v: 1, t: "p", k: "proj1/dep1", m: "n" }));
  await env.SITES_KV.put(`h:${SPA_HOST}`, JSON.stringify({ v: 1, t: "p", k: "proj2/dep2", m: "s" }));
  await env.SITES_KV.put(
    "h:old-q9z.useframe.in",
    JSON.stringify({ v: 1, t: "r", u: "https://www.acme.com" }),
  );
  await env.SITES_KV.put("h:bad-m4n.useframe.in", JSON.stringify({ v: 1, t: "x" }));
  await env.SITES_KV.put("h:broken-k2p.useframe.in", "{not json");

  await put("sites/proj1/dep1/index.html", "<h1>home</h1>", "text/html; charset=utf-8", HTML_CC);
  await put("sites/proj1/dep1/about/index.html", "<h1>about</h1>", "text/html; charset=utf-8", HTML_CC);
  await put("sites/proj1/dep1/404.html", "<h1>custom 404</h1>", "text/html; charset=utf-8", HTML_CC);
  await put(
    "sites/proj1/dep1/_next/static/a.js",
    "console.log(1)",
    "text/javascript; charset=utf-8",
    "public, max-age=31536000, immutable",
  );
  await put("sites/proj1/dep1/media/clip.mp4", "0123456789", "video/mp4", "public, max-age=3600");
  await put("sites/proj2/dep2/index.html", "<div id=root></div>", "text/html; charset=utf-8", HTML_CC);
  await put("sites/proj2/dep2/assets/a.js", "spa()", "text/javascript; charset=utf-8");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("routing", () => {
  it("returns the generic 404 for an unknown host", async () => {
    const res = await call("https://nobody-zzz.useframe.in/");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("Site not found");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serves a Next export", async () => {
    const home = await call(`https://${NEXT_HOST}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toBe("<h1>home</h1>");
    expect(home.headers.get("x-useframe-deployment")).toBe("dep1");
    expect(home.headers.get("cache-control")).toBe(HTML_CC);

    const bare = await call(`https://${NEXT_HOST}/about?ref=x`);
    expect(bare.status).toBe(301);
    expect(bare.headers.get("location")).toBe("/about/?ref=x");

    const about = await call(`https://${NEXT_HOST}/about/`);
    expect(await about.text()).toBe("<h1>about</h1>");

    const asset = await call(`https://${NEXT_HOST}/_next/static/a.js`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    await asset.text();

    const missing = await call(`https://${NEXT_HOST}/nope/`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe("<h1>custom 404</h1>");
    expect(missing.headers.get("cache-control")).toBe(HTML_CC);
  });

  it("serves a Vite SPA with client-side route fallback", async () => {
    const deep = await call(`https://${SPA_HOST}/pricing/plans`);
    expect(deep.status).toBe(200);
    expect(await deep.text()).toBe("<div id=root></div>");

    const asset = await call(`https://${SPA_HOST}/assets/a.js`);
    expect(await asset.text()).toBe("spa()");

    const missing = await call(`https://${SPA_HOST}/missing.js`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Site not found");
  });

  it("answers 403 for a suspended site", async () => {
    const res = await call("https://bad-m4n.useframe.in/");
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("suspended");
  });

  it("redirects with path and query preserved", async () => {
    const res = await call("https://old-q9z.useframe.in/pricing/?plan=pro");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("https://www.acme.com/pricing/?plan=pro");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
  });

  it("treats malformed KV JSON as not found", async () => {
    const res = await call("https://broken-k2p.useframe.in/");
    expect(res.status).toBe(404);
  });

  it("answers 503 with Retry-After when KV throws", async () => {
    vi.spyOn(env.SITES_KV, "get").mockRejectedValue(new Error("kv down"));
    const res = await call(`https://${NEXT_HOST}/`);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("5");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("answers health without reading KV", async () => {
    const spy = vi.spyOn(env.SITES_KV, "get");
    const res = await call(`https://${NEXT_HOST}/__useframe/health`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("useframe-ok");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(spy).not.toHaveBeenCalled();
  });

  it("upgrades http to https", async () => {
    const res = await call(`http://${NEXT_HOST}/about/?a=1`);
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe(`https://${NEXT_HOST}/about/?a=1`);
  });

  it("passes reserved hosts through untouched", async () => {
    const kv = vi.spyOn(env.SITES_KV, "get");
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("dashboard"));
    const res = await call("https://useframe.in/projects", { method: "POST", body: "x" });
    expect(await res.text()).toBe("dashboard");
    expect(upstream).toHaveBeenCalledOnce();
    const forwarded = upstream.mock.calls[0]![0] as Request;
    expect(forwarded.url).toBe("https://useframe.in/projects");
    expect(forwarded.method).toBe("POST");
    expect(kv).not.toHaveBeenCalled();
  });

  it("passes certificate challenge paths through before the https redirect", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("token"));
    for (const path of [
      "/.well-known/acme-challenge/abc",
      "/.well-known/pki-validation/x.txt",
      "/.well-known/cf-custom-hostname-challenge/id",
    ]) {
      const res = await call(`http://www.acme.com${path}`);
      expect(await res.text()).toBe("token");
    }
    expect(upstream).toHaveBeenCalledTimes(3);
  });

  it("limits methods", async () => {
    const options = await call(`https://${NEXT_HOST}/`, { method: "OPTIONS" });
    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    const post = await call(`https://${NEXT_HOST}/`, { method: "POST" });
    expect(post.status).toBe(405);
  });

  it("rejects bad paths with 400", async () => {
    const res = await call(`https://${NEXT_HOST}/a%2F/b`);
    expect(res.status).toBe(400);
  });
});

describe("responses", () => {
  it("returns 304 for a matching If-None-Match", async () => {
    const first = await call(`https://${NEXT_HOST}/`);
    const etag = first.headers.get("etag")!;
    await first.text();
    const second = await call(`https://${NEXT_HOST}/`, {
      headers: { "if-none-match": `W/${etag}` },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get("etag")).toBe(etag);
    expect(await second.text()).toBe("");
  });

  it("answers HEAD with headers and no body", async () => {
    const res = await call(`https://${NEXT_HOST}/`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("");
  });

  it("serves byte ranges with 206", async () => {
    const res = await call(`https://${NEXT_HOST}/media/clip.mp4`, {
      headers: { range: "bytes=2-5" },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("x-useframe-cache")).toBe("bypass");
    expect(await res.text()).toBe("2345");
  });

  it("advertises ranges on full media responses", async () => {
    const res = await call(`https://${NEXT_HOST}/media/clip.mp4`);
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    await res.text();
  });

  it("sets security headers, HSTS only on the base domain", async () => {
    const res = await call(`https://${NEXT_HOST}/`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("x-frame-options")).toBeNull();
    await res.text();

    await env.SITES_KV.put(
      "h:www.acme.com",
      JSON.stringify({ v: 1, t: "p", k: "proj1/dep1", m: "n" }),
    );
    const custom = await call("https://www.acme.com/");
    expect(custom.status).toBe(200);
    expect(custom.headers.get("strict-transport-security")).toBeNull();
    await custom.text();
  });

  it("reads R2 once and serves the repeat from the Cache API", async () => {
    await put(
      "sites/proj1/dep1/_next/static/cached.js",
      "console.log(1)",
      "text/javascript; charset=utf-8",
      "public, max-age=31536000, immutable",
    );
    const r2 = vi.spyOn(env.SITES_BUCKET, "get");
    const first = await call(`https://${NEXT_HOST}/_next/static/cached.js`);
    expect(first.headers.get("x-useframe-cache")).toBe("miss");
    expect(await first.text()).toBe("console.log(1)");
    const second = await call(`https://${NEXT_HOST}/_next/static/cached.js`);
    expect(second.headers.get("x-useframe-cache")).toBe("hit");
    expect(second.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(second.headers.get("x-uf-cc")).toBeNull();
    expect(await second.text()).toBe("console.log(1)");
    expect(r2).toHaveBeenCalledTimes(1);
  });
});
