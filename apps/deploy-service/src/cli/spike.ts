// Run against the real Cloudflare account after `terraform apply` + `wrangler deploy`.
// Test data only: KV keys h:spike-<rand>*.<base>, R2 prefixes sites/_spike/<rand>-*/.
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/config/env.js";
import { CloudflareKv } from "@/lib/cloudflareKv.js";
import { createR2, deletePrefix, listKeys, uploadFile } from "@/lib/r2.js";
import { sleep } from "@/lib/retry.js";
import { contentTypeFor, cacheControlFor } from "@/pipeline/upload.js";

type Status = "PASS" | "FAIL" | "WARN" | "SKIP";
const results: { check: string; status: Status; detail: string }[] = [];
function report(check: string, status: Status, detail: string) {
  results.push({ check, status, detail });
  console.log(`${status.padEnd(4)}  ${check} — ${detail}`);
}

const rand = randomBytes(4).toString("hex");
const project = "_spike";
const v1 = `${rand}-v1`;
const v2 = `${rand}-v2`;
const host = `spike-${rand}.${env.SITES_BASE_DOMAIN}`;
const negativeHost = `spike-${rand}-neg.${env.SITES_BASE_DOMAIN}`;
const base = `https://${host}`;
const EMAIL_HTML = `<!doctype html><html><body><h1>spike home</h1><p>Contact hello@example.com or <a href="mailto:hello@example.com">mail us</a>.</p></body></html>`;

const kv = new CloudflareKv({
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  namespaceId: env.SITES_KV_NAMESPACE_ID,
  apiToken: env.CLOUDFLARE_API_TOKEN,
});
const r2 = createR2({
  endpoint: env.SITES_R2_ENDPOINT,
  accessKeyId: env.SITES_R2_ACCESS_KEY_ID,
  secretAccessKey: env.SITES_R2_SECRET_ACCESS_KEY,
  bucket: env.SITES_R2_BUCKET,
});

const pointer = (deployment: string, m: "n" | "s") =>
  JSON.stringify({ v: 1, t: "p", k: `${project}/${deployment}`, m });

const get = (url: string, init?: RequestInit) =>
  fetch(url, { redirect: "manual", headers: { "cache-control": "no-cache" }, ...init });

async function uploadTree(prefix: string, files: Record<string, string | Buffer>, dir: string) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel.replaceAll("/", "_"));
    await writeFile(abs, content);
    await uploadFile(r2, prefix + rel, abs, Buffer.byteLength(content), contentTypeFor(rel), cacheControlFor(rel));
  }
}

async function waitForDeployment(target: string, timeoutMs: number): Promise<number | null> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await get(`${base}/`).catch(() => null);
    await res?.body?.cancel();
    if (res?.status === 200 && res.headers.get("x-useframe-deployment") === target) return Date.now() - started;
    await sleep(1000);
  }
  return null;
}

function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  return { min: s[0]!, median: at(0.5), p95: at(0.95), max: s[s.length - 1]! };
}

async function checkR2(dir: string): Promise<boolean> {
  const prefix = `sites/${project}/${rand}-r2check/`;
  try {
    let t = Date.now();
    await uploadTree(prefix, { "hello.txt": "hello r2" }, dir);
    const got = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: prefix + "hello.txt" }));
    const body = await got.Body?.transformToString();
    if (body !== "hello r2") throw new Error(`GET returned ${body}`);
    report("1a R2 PUT/GET (S3 client, checksums WHEN_REQUIRED)", "PASS", `${Date.now() - t} ms`);

    t = Date.now();
    const big = randomBytes(6 * 1024 * 1024);
    await uploadTree(prefix, { "big.bin": big }, dir);
    report("1b R2 multipart upload (6 MiB, lib-storage)", "PASS", `${Date.now() - t} ms`);

    t = Date.now();
    const deleted = await deletePrefix(r2, prefix);
    const left = await listKeys(r2, prefix);
    if (left.length) throw new Error(`${left.length} objects left after DeleteObjects`);
    report("1c R2 DeleteObjects", "PASS", `${deleted} objects in ${Date.now() - t} ms`);
    return true;
  } catch (err) {
    report("1 R2 via S3 API", "FAIL", err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    return false;
  }
}

async function checkKv(): Promise<boolean> {
  const key = `h:spike-${rand}-kvcheck.${env.SITES_BASE_DOMAIN}`;
  try {
    const t = Date.now();
    await kv.put(key, '{"v":1,"t":"x"}');
    if ((await kv.get(key)) !== '{"v":1,"t":"x"}') throw new Error("GET did not return the PUT value");
    const listed = await kv.listKeys(`h:spike-${rand}`);
    if (!listed.includes(key)) throw new Error("listKeys did not return the key");
    await kv.delete(key);
    await kv.bulkPut([
      { key: `${key}-a`, value: '{"v":1,"t":"x"}' },
      { key: `${key}-b`, value: '{"v":1,"t":"x"}' },
    ]);
    await kv.bulkDelete([`${key}-a`, `${key}-b`]);
    report("2 KV REST put/get/list/delete/bulk", "PASS", `${Date.now() - t} ms`);
    return true;
  } catch (err) {
    report("2 KV REST", "FAIL", err instanceof Error ? err.message : String(err));
    return false;
  }
}

async function checkServing(dir: string): Promise<boolean> {
  const bigAsset = randomBytes(512 * 1024).toString("base64");
  await uploadTree(
    `sites/${project}/${v1}/`,
    {
      "index.html": EMAIL_HTML,
      "about/index.html": "<h1>spike about</h1>",
      "404.html": "<h1>spike 404</h1>",
      "_next/static/a.js": "console.log('a')",
      "_next/static/big.js": `/*${bigAsset}*/`,
    },
    dir,
  );
  await uploadTree(
    `sites/${project}/${v2}/`,
    { "index.html": "<div id=root>spa</div>", "assets/a.js": "spa()" },
    dir,
  );
  await kv.put(`h:${host}`, pointer(v1, "n"));
  const visible = await waitForDeployment(v1, 180_000);
  if (visible === null) {
    report("3 end-to-end serving", "FAIL", `${host} never served ${v1} (wildcard DNS / Worker route / certificate?)`);
    return false;
  }
  report("3a first serve over HTTPS (wildcard DNS + Universal SSL)", "PASS", `visible after ${visible} ms`);

  const failures: string[] = [];
  const home = await get(`${base}/`);
  const homeBody = await home.text();
  for (const [name, value] of [
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["strict-transport-security", "max-age=31536000"],
  ] as const) {
    if (home.headers.get(name) !== value) failures.push(`${name}=${home.headers.get(name)}`);
  }
  const about = await get(`${base}/about`);
  if (about.status !== 301 || about.headers.get("location") !== "/about/") failures.push(`/about → ${about.status}`);
  await about.body?.cancel();
  const aboutSlash = await get(`${base}/about/`);
  if ((await aboutSlash.text()) !== "<h1>spike about</h1>") failures.push("/about/ body");
  const missing = await get(`${base}/nope/`);
  if (missing.status !== 404 || (await missing.text()) !== "<h1>spike 404</h1>") failures.push("404.html");
  const a1 = await get(`${base}/_next/static/a.js`);
  await a1.text();
  const a2 = await get(`${base}/_next/static/a.js`);
  await a2.text();
  if (a2.headers.get("x-useframe-cache") !== "hit") {
    failures.push(`cache miss→hit got ${a1.headers.get("x-useframe-cache")}→${a2.headers.get("x-useframe-cache")}`);
  }

  await kv.put(`h:${host}`, pointer(v2, "s"));
  if ((await waitForDeployment(v2, 180_000)) === null) failures.push("flip to SPA never visible");
  const deep = await get(`${base}/pricing/plans`);
  if (deep.status !== 200 || (await deep.text()) !== "<div id=root>spa</div>") failures.push("SPA fallback");
  const spaMissing = await get(`${base}/missing.js`);
  await spaMissing.body?.cancel();
  if (spaMissing.status !== 404) failures.push(`SPA missing asset → ${spaMissing.status}`);

  report("3b routing, headers, 404.html, SPA fallback, cache", failures.length ? "FAIL" : "PASS", failures.join("; ") || "all as specified");

  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  if (sha(homeBody) === sha(EMAIL_HTML)) report("6 HTML integrity", "PASS", "byte-identical");
  else {
    report(
      "6 HTML integrity",
      "WARN",
      "HTML was modified at the edge — likely Email Address Obfuscation, Rocket Loader, Automatic HTTPS Rewrites or Auto Minify on the zone",
    );
  }

  const big1 = await get(`${base}/_next/static/big.js`);
  await big1.text();
  const big2 = await get(`${base}/_next/static/big.js`);
  await big2.text();
  report(
    "8 Cache API effectiveness",
    big2.headers.get("x-useframe-cache") === "hit" ? "PASS" : "WARN",
    `${big1.headers.get("x-useframe-cache")} → ${big2.headers.get("x-useframe-cache")}`,
  );
  return failures.length === 0;
}

async function checkPropagation() {
  const times: number[] = [];
  let target = v1;
  for (let i = 0; i < 5; i++) {
    target = target === v1 ? v2 : v1;
    await kv.put(`h:${host}`, pointer(target, target === v1 ? "n" : "s"));
    const ms = await waitForDeployment(target, 300_000);
    if (ms === null) {
      report(`4 pointer flip ${i + 1}`, "FAIL", "not visible within 300 s");
      return;
    }
    times.push(ms);
    await sleep(1500);
  }
  const s = stats(times);
  const budget = env.DEPLOY_ACTIVATION_PROBE_MS;
  report(
    "4 pointer-flip propagation",
    s.p95 > budget * 0.6 ? "WARN" : "PASS",
    `min ${s.min} / median ${s.median} / p95 ${s.p95} / max ${s.max} ms (probe budget ${budget} ms${s.p95 > budget * 0.6 ? " — raise DEPLOY_ACTIVATION_PROBE_MS" : ""})`,
  );
}

async function checkNegativeCache() {
  const url = `https://${negativeHost}/`;
  const before = await get(url);
  await before.body?.cancel();
  await kv.put(`h:${negativeHost}`, pointer(v1, "n"));
  const started = Date.now();
  while (Date.now() - started < 300_000) {
    const res = await get(url).catch(() => null);
    await res?.body?.cancel();
    if (res?.status === 200) {
      report("5 new host after a cached miss", "PASS", `visible after ${Date.now() - started} ms (first answer was ${before.status})`);
      return;
    }
    await sleep(1000);
  }
  report("5 new host after a cached miss", "WARN", "not visible within 300 s");
}

async function checkReservedHost() {
  const url = process.env.SPIKE_RESERVED_HOST_URL;
  if (!url) {
    report("7 reserved host pass-through", "SKIP", "set SPIKE_RESERVED_HOST_URL (e.g. https://useframe.in/) to run");
    return;
  }
  const res = await fetch(url, { redirect: "manual" });
  const text = (await res.text()).replace(/\s+/g, " ").slice(0, 160);
  const isWorkerPage = text.includes("Site not found") || res.headers.has("x-useframe-deployment");
  report("7 reserved host pass-through", isWorkerPage ? "FAIL" : "PASS", `${res.status} ${text}`);
}

const dir = await mkdtemp(path.join(os.tmpdir(), "useframe-spike-"));
try {
  console.log(`Spike ${rand}: host ${host}\n`);
  const core = (await checkR2(dir)) && (await checkKv()) && (await checkServing(dir));
  if (!core) {
    console.log("\nCore checks 1–3 failed: stop here and report; do not change the design.");
    process.exitCode = 1;
  } else {
    await checkPropagation();
    await checkNegativeCache();
    await checkReservedHost();
  }
} finally {
  await kv.bulkDelete([`h:${host}`, `h:${negativeHost}`]).catch(() => undefined);
  for (const deployment of [v1, v2, `${rand}-r2check`]) {
    await deletePrefix(r2, `sites/${project}/${deployment}/`).catch(() => undefined);
  }
  await rm(dir, { recursive: true, force: true });
  console.log("\nCleaned up spike KV keys and R2 objects.");
  console.table(results);
  process.exit();
}
