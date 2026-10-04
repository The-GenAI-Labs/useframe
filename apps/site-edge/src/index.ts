import {
  etagMatches,
  isPassThroughPath,
  normalizePath,
  parseEntry,
  parseHostList,
  planServe,
} from "./resolve.js";

export interface Env {
  SITES_KV: KVNamespace;
  SITES_BUCKET: R2Bucket;
  SITES_BASE_DOMAIN: string;
  RESERVED_HOSTS: string;
}

type CacheState = "hit" | "miss" | "bypass";

type LoadedObject = {
  body: ReadableStream | null;
  contentType: string;
  etag: string;
  cacheControl: string;
  cache: CacheState;
};

const MAX_CACHED_BYTES = 5 * 1024 * 1024;
const CACHE_ORIGIN = "https://sites.useframe.internal";
const HTML_404_CACHE_CONTROL = "public, max-age=0, must-revalidate";

function page(title: string, message: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#111;background:#fafafa;text-align:center;padding:16px}h1{font-size:1.5rem;margin:0 0 .5rem}p{margin:0;color:#555}</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

const PAGES = {
  notFound: page("Site not found", "This address is not connected to a published site."),
  suspended: page("Site unavailable", "This site has been suspended."),
  unavailable: page("Service temporarily unavailable", "Please try again in a moment."),
  badRequest: page("Bad request", "This address could not be understood."),
};

function baseHeaders(host: string, baseDomain: string): Headers {
  const headers = new Headers({
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
  // Never includeSubDomains/preload: the parent domain is shared with the dashboard.
  if (host.endsWith(`.${baseDomain.toLowerCase()}`)) {
    headers.set("strict-transport-security", "max-age=31536000");
  }
  return headers;
}

function genericPage(status: number, html: string, headers: Headers, method: string): Response {
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(method === "HEAD" ? null : html, { status, headers });
}

function redirect(location: string, headers: Headers, cacheControl?: string): Response {
  headers.set("location", location);
  if (cacheControl) headers.set("cache-control", cacheControl);
  return new Response(null, { status: 301, headers });
}

function cacheKey(deploymentKey: string, relKey: string): Request {
  const encoded = relKey.split("/").map(encodeURIComponent).join("/");
  return new Request(`${CACHE_ORIGIN}/${deploymentKey}/${encoded}`, { method: "GET" });
}

async function loadObject(
  env: Env,
  ctx: ExecutionContext,
  deploymentKey: string,
  relKey: string,
): Promise<LoadedObject | null> {
  const cache = caches.default;
  const key = cacheKey(deploymentKey, relKey);

  const cached = await cache.match(key);
  if (cached) {
    return {
      body: cached.body,
      contentType: cached.headers.get("content-type") ?? "application/octet-stream",
      etag: cached.headers.get("etag") ?? "",
      cacheControl: cached.headers.get("x-uf-cc") ?? "public, max-age=3600",
      cache: "hit",
    };
  }

  const obj = await env.SITES_BUCKET.get(`sites/${deploymentKey}/${relKey}`);
  if (!obj) return null;

  const contentType = obj.httpMetadata?.contentType ?? "application/octet-stream";
  const cacheControl = obj.httpMetadata?.cacheControl ?? "public, max-age=3600";

  if (obj.size > MAX_CACHED_BYTES) {
    return { body: obj.body, contentType, etag: obj.httpEtag, cacheControl, cache: "bypass" };
  }

  const [toClient, toCache] = obj.body.tee();
  const stored = new Response(toCache, {
    headers: {
      "content-type": contentType,
      etag: obj.httpEtag,
      "cache-control": "public, max-age=31536000",
      "x-uf-cc": cacheControl,
    },
  });
  ctx.waitUntil(cache.put(key, stored).catch(() => undefined));
  return { body: toClient, contentType, etag: obj.httpEtag, cacheControl, cache: "miss" };
}

function isMedia(contentType: string): boolean {
  return contentType.startsWith("video/") || contentType.startsWith("audio/");
}

async function serveRange(
  env: Env,
  request: Request,
  r2Key: string,
  headers: Headers,
): Promise<Response | null> {
  let obj: R2ObjectBody | R2Object | null;
  try {
    obj = await env.SITES_BUCKET.get(r2Key, { range: request.headers });
  } catch {
    const head = await env.SITES_BUCKET.head(r2Key);
    if (!head) return null;
    headers.set("content-range", `bytes */${head.size}`);
    return new Response(null, { status: 416, headers });
  }
  if (!obj) return null;

  headers.set("content-type", obj.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", obj.httpMetadata?.cacheControl ?? "public, max-age=3600");
  headers.set("accept-ranges", "bytes");
  headers.set("x-useframe-cache", "bypass");

  const body = "body" in obj ? obj.body : null;
  const range = obj.range;
  if (!range) {
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  }
  // The runtime may return every key with undefined values, so check values, not keys.
  const r = range as { offset?: number; length?: number; suffix?: number };
  let offset: number;
  let length: number;
  if (r.suffix !== undefined) {
    length = Math.min(r.suffix, obj.size);
    offset = obj.size - length;
  } else {
    offset = r.offset ?? 0;
    length = r.length ?? obj.size - offset;
  }
  headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
  headers.set("content-length", String(length));
  return new Response(request.method === "HEAD" ? null : body, { status: 206, headers });
}

async function serve(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  path: string,
  deploymentKey: string,
  mode: "n" | "s",
  headers: Headers,
): Promise<Response> {
  const deploymentId = deploymentKey.slice(deploymentKey.indexOf("/") + 1);
  headers.set("x-useframe-deployment", deploymentId);

  const plan = planServe(mode, path);
  if (plan.kind === "redirect") {
    return redirect(url.pathname + "/" + url.search, headers);
  }

  if (request.headers.has("range")) {
    const ranged = await serveRange(env, request, `sites/${deploymentKey}/${plan.key}`, headers);
    if (ranged) return ranged;
  }

  let status = 200;
  let loaded = await loadObject(env, ctx, deploymentKey, plan.key);
  if (!loaded && plan.onMiss === "404") {
    loaded = await loadObject(env, ctx, deploymentKey, "404.html");
    status = 404;
  }
  if (!loaded) {
    headers.delete("x-useframe-deployment");
    return genericPage(404, PAGES.notFound, headers, request.method);
  }

  headers.set("content-type", loaded.contentType);
  if (loaded.etag) headers.set("etag", loaded.etag);
  headers.set("cache-control", status === 404 ? HTML_404_CACHE_CONTROL : loaded.cacheControl);
  headers.set("x-useframe-cache", loaded.cache);
  if (isMedia(loaded.contentType)) headers.set("accept-ranges", "bytes");

  if (status === 200 && loaded.etag && etagMatches(request.headers.get("if-none-match"), loaded.etag)) {
    await loaded.body?.cancel();
    return new Response(null, { status: 304, headers });
  }
  if (request.method === "HEAD") {
    await loaded.body?.cancel();
    return new Response(null, { status, headers });
  }
  return new Response(loaded.body, { status, headers });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (parseHostList(env.RESERVED_HOSTS).has(host)) return fetch(request);
    if (isPassThroughPath(url.pathname)) return fetch(request);

    const headers = baseHeaders(host, env.SITES_BASE_DOMAIN);

    if (url.protocol === "http:") {
      url.protocol = "https:";
      return redirect(url.toString(), headers);
    }

    if (url.pathname === "/__useframe/health" && (request.method === "GET" || request.method === "HEAD")) {
      headers.set("content-type", "text/plain; charset=utf-8");
      headers.set("cache-control", "no-store");
      return new Response(request.method === "HEAD" ? null : "useframe-ok", { status: 200, headers });
    }

    if (request.method === "OPTIONS") {
      headers.set("allow", "GET, HEAD, OPTIONS");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      headers.set("allow", "GET, HEAD, OPTIONS");
      return genericPage(405, PAGES.badRequest, headers, request.method);
    }

    const normalized = normalizePath(url.pathname);
    if (!normalized.ok) return genericPage(400, PAGES.badRequest, headers, request.method);

    let raw: string | null;
    try {
      raw = await env.SITES_KV.get(`h:${host}`, { type: "text", cacheTtl: 30 });
    } catch {
      headers.set("retry-after", "5");
      return genericPage(503, PAGES.unavailable, headers, request.method);
    }

    // Parsed here rather than with type:"json" so malformed data is a 404, not an outage.
    let entry = null;
    if (raw !== null) {
      try {
        entry = parseEntry(JSON.parse(raw));
      } catch {
        entry = null;
      }
    }

    if (!entry) return genericPage(404, PAGES.notFound, headers, request.method);
    if (entry.t === "x") return genericPage(403, PAGES.suspended, headers, request.method);
    if (entry.t === "r") {
      return redirect(entry.u + url.pathname + url.search, headers, "public, max-age=300");
    }
    return serve(request, env, ctx, url, normalized.path, entry.k, entry.m, headers);
  },
} satisfies ExportedHandler<Env>;
