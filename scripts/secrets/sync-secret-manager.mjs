#!/usr/bin/env node
// Builds the production Kubernetes Secrets from the local .env files plus an overrides file, and
// uploads each one to Google Secret Manager as `useframe-prod-<secret>` (JSON of KEY: value).
// External Secrets Operator syncs them into the cluster (infra/k8s/external-secrets).
// Never prints a value: only key names, counts and check results.
//
//   node scripts/secrets/sync-secret-manager.mjs --project <id> [--dry-run]
//     [--overrides C:\useframe-prod\overrides.env] [--allow-razorpay-test]
//     [--allow-shared-dev-database] [--allow-missing KEY[,KEY]] [--generate KEY[,KEY]]
//     [--redis-instance useframe-redis] [--region asia-southeast1] [--skip-dev-backup]

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const SECRETS = {
  "server-secrets": {
    env: "apps/server",
    required: ["DATABASE_URL", "REDIS_URL", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "INTERNAL_SERVICE_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "RESEND_API_KEY", "TURNSTILE_SECRET_KEY"],
    optional: ["JWT_ACCESS_EXPIRY", "JWT_REFRESH_EXPIRY", "BCRYPT_ROUNDS", "EMAIL_FROM", "IPQS_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "MEDIA_R2_ACCESS_KEY_ID", "MEDIA_R2_SECRET_ACCESS_KEY", "MEDIA_R2_ENDPOINT", "MEDIA_SIGNING_SECRET", "REVIEWER_LOGIN_ENABLED", "REVIEWER_EMAIL", "REVIEWER_PASSWORD_HASH", "REVIEWER_STARTING_CREDITS"],
  },
  "orchestrator-service-secrets": {
    env: "apps/orchestrator-service",
    required: ["DATABASE_URL", "REDIS_URL", "JWT_ACCESS_SECRET", "INTERNAL_SERVICE_SECRET"],
    optional: ["ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "KIMI_API_KEY", "BRAVE_API_KEY", "TYPESAFE_API_KEY", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"],
    oneOf: ["ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "KIMI_API_KEY"],
  },
  "research-service-secrets": {
    env: "apps/research-service",
    required: ["DATABASE_URL", "REDIS_URL", "INTERNAL_SERVICE_SECRET", "VOYAGE_API_KEY"],
    optional: ["COHERE_API_KEY", "OPENAI_API_KEY", "TYPESAFE_API_KEY", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"],
  },
  "deploy-service-secrets": {
    env: "apps/deploy-service",
    required: ["DATABASE_URL", "REDIS_URL", "INTERNAL_SERVICE_SECRET", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "SITES_KV_NAMESPACE_ID", "SITES_R2_ACCESS_KEY_ID", "SITES_R2_SECRET_ACCESS_KEY"],
    optional: ["CLOUDFLARE_ZONE_ID", "SITES_R2_ENDPOINT", "MEDIA_R2_BUCKET", "MEDIA_R2_ENDPOINT", "MEDIA_R2_READ_ACCESS_KEY_ID", "MEDIA_R2_READ_SECRET_ACCESS_KEY"],
  },
  "billing-service-secrets": {
    env: "apps/billing-service",
    required: ["DATABASE_URL", "REDIS_URL", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
    optional: [],
  },
  "scoring-service-secrets": {
    env: "apps/scoring-service",
    required: ["DATABASE_URL", "REDIS_URL", "INTERNAL_SERVICE_SECRET"],
    optional: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
    oneOf: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY"],
  },
  "media-service-secrets": {
    env: "apps/media-service",
    required: ["DATABASE_URL", "REDIS_URL", "INTERNAL_SERVICE_SECRET", "MEDIA_R2_ACCESS_KEY_ID", "MEDIA_R2_SECRET_ACCESS_KEY"],
    optional: ["MEDIA_R2_ENDPOINT", "CLOUDFLARE_ACCOUNT_ID", "OPENAI_API_KEY", "RUNWARE_API_KEY"],
    oneOf: ["MEDIA_R2_ENDPOINT", "CLOUDFLARE_ACCOUNT_ID"],
  },
  "worker-secrets": {
    env: "apps/worker",
    required: ["DATABASE_URL", "REDIS_URL", "INTERNAL_SERVICE_SECRET", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
    optional: ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "VOYAGE_API_KEY"],
  },
  "migrate-secrets": {
    env: "packages/db",
    required: ["DATABASE_URL"],
    optional: [],
    directDatabaseUrl: true,
  },
};

const DEV_ENV_FILES = ["apps/server", "apps/orchestrator-service", "apps/research-service", "apps/deploy-service", "apps/billing-service", "apps/scoring-service", "apps/media-service", "apps/worker", "apps/web", "packages/db", "packages/rag"];

function parseArgs(argv) {
  const opts = { overrides: "C:\\useframe-prod\\overrides.env", redisInstance: "useframe-redis", region: "asia-southeast1", allowMissing: [], generate: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--project") opts.project = next();
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--overrides") opts.overrides = next();
    else if (a === "--allow-razorpay-test") opts.allowRazorpayTest = true;
    else if (a === "--allow-shared-dev-database") opts.allowSharedDevDb = true;
    else if (a === "--allow-missing") opts.allowMissing.push(...next().split(","));
    else if (a === "--generate") opts.generate.push(...next().split(","));
    else if (a === "--redis-instance") opts.redisInstance = next();
    else if (a === "--region") opts.region = next();
    else if (a === "--skip-dev-backup") opts.skipDevBackup = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!opts.project) throw new Error("--project is required");
  return opts;
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

function gcloud(args, { input, allowFail } = {}) {
  const win = process.platform === "win32";
  const r = spawnSync("gcloud", win ? args.map((a) => `"${a}"`) : args, { input, encoding: "utf8", shell: win, maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0 && !allowFail) throw new Error(`gcloud ${args.slice(0, 3).join(" ")} failed: ${(r.stderr || "").trim().split("\n").pop()}`);
  return r;
}

function devProblem(key, value, opts) {
  if (value === "") return "empty";
  if (/localhost|127\.0\.0\.1/i.test(value)) return "points at localhost";
  if (/changeme|your[-_]|x{3,}|REPLACE_WITH/i.test(value)) return "looks like a placeholder";
  if (value.includes("ep-odd-smoke") && !(key === "DATABASE_URL" && opts.allowSharedDevDb)) return "uses the dev Neon endpoint";
  if (value.startsWith("rzp_test_") && !opts.allowRazorpayTest) return "is a Razorpay test key (pass --allow-razorpay-test)";
  return null;
}

function stableJson(obj) {
  return JSON.stringify(Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  for (const key of opts.generate) {
    const current = existsSync(opts.overrides) ? parseEnv(readFileSync(opts.overrides, "utf8")) : {};
    if (current[key]) {
      console.log(`generate: ${key} already set in overrides, kept`);
      continue;
    }
    mkdirSync(path.dirname(opts.overrides), { recursive: true });
    appendFileSync(opts.overrides, `\n${key}=${randomBytes(32).toString("hex")}\n`);
    console.log(`generate: ${key} written to ${opts.overrides}`);
  }

  const envs = {};
  for (const dir of DEV_ENV_FILES) {
    const file = path.join(ROOT, dir, ".env");
    if (existsSync(file)) envs[dir] = { file, raw: readFileSync(file, "utf8"), vars: parseEnv(readFileSync(file, "utf8")) };
  }
  const overrides = existsSync(opts.overrides) ? parseEnv(readFileSync(opts.overrides, "utf8")) : {};
  console.log(`read ${Object.keys(envs).length} .env files; overrides: ${existsSync(opts.overrides) ? `${Object.keys(overrides).length} keys` : "none"}`);

  const shared = {};
  for (const { vars } of Object.values(envs))
    for (const [k, v] of Object.entries(vars)) if (v !== "") (shared[k] ??= new Set()).add(v);

  const redisHost = gcloud(["redis", "instances", "describe", opts.redisInstance, `--region=${opts.region}`, `--project=${opts.project}`, "--format=value(host,port)"]).stdout.trim().split(/\s+/);
  const redisAuth = gcloud(["redis", "instances", "get-auth-string", opts.redisInstance, `--region=${opts.region}`, `--project=${opts.project}`, "--format=value(authString)"]).stdout.trim();
  const redisUrl = `redis://${redisAuth ? `:${encodeURIComponent(redisAuth)}@` : ""}${redisHost[0]}:${redisHost[1] || 6379}`;

  const built = {};
  const errors = [];
  for (const [name, spec] of Object.entries(SECRETS)) {
    const own = envs[spec.env]?.vars ?? {};
    const data = {};
    const notes = [];
    for (const key of [...spec.required, ...spec.optional]) {
      let value;
      let source;
      if (overrides[key] !== undefined) [value, source] = [overrides[key], "override"];
      else if (key === "REDIS_URL") [value, source] = [redisUrl, "memorystore"];
      else if (own[key]) [value, source] = [own[key], "copy"];
      else if (shared[key]?.size === 1) [value, source] = [[...shared[key]][0], "shared"];
      else if (shared[key]?.size > 1) {
        errors.push(`${name}: ${key} differs between .env files; set it in the overrides file`);
        continue;
      }
      if (value === undefined || value === "") {
        if (spec.required.includes(key)) {
          if (opts.allowMissing.includes(key)) notes.push(`${key} missing (allowed)`);
          else errors.push(`${name}: ${key} is required but missing or empty`);
        } else if (key in own) notes.push(`${key} dropped (empty)`);
        continue;
      }
      if (spec.directDatabaseUrl && key === "DATABASE_URL") value = value.replace(/-pooler\./, ".");
      const problem = devProblem(key, value, opts);
      if (problem === "looks like a placeholder" && !spec.required.includes(key)) {
        notes.push(`${key} dropped (placeholder)`);
        continue;
      }
      if (problem) {
        errors.push(`${name}: ${key} ${problem}`);
        continue;
      }
      if (source === "shared") notes.push(`${key} from another .env`);
      data[key] = value;
    }
    if (spec.oneOf && !spec.oneOf.some((k) => data[k])) errors.push(`${name}: needs one of ${spec.oneOf.join(", ")}`);
    const ignored = Object.keys(own).filter((k) => !(k in data) && !spec.required.includes(k) && !spec.optional.includes(k));
    built[name] = { data, notes, ignored };
  }

  const isrs = new Set(Object.values(built).map((b) => b.data.INTERNAL_SERVICE_SECRET).filter(Boolean));
  if (isrs.size > 1) errors.push("INTERNAL_SERVICE_SECRET is not the same in every Secret");
  if (built["server-secrets"].data.JWT_ACCESS_SECRET !== built["orchestrator-service-secrets"].data.JWT_ACCESS_SECRET)
    errors.push("JWT_ACCESS_SECRET differs between server-secrets and orchestrator-service-secrets");

  for (const [name, b] of Object.entries(built)) {
    console.log(`\n${name}: ${Object.keys(b.data).length} keys`);
    console.log(`  keys: ${Object.keys(b.data).sort().join(" ")}`);
    if (b.notes.length) console.log(`  notes: ${b.notes.join("; ")}`);
    if (b.ignored.length) console.log(`  not stored (chart-managed, legacy or unread): ${b.ignored.sort().join(" ")}`);
  }

  if (errors.length) {
    console.error(`\nREFUSED: ${errors.length} problem(s), nothing uploaded`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("\nchecks: passed");

  const uploads = Object.entries(built).map(([name, b]) => ({ secret: `useframe-prod-${name}`, content: stableJson(b.data), keys: Object.keys(b.data).length, labels: "app=useframe,env=prod" }));
  if (!opts.skipDevBackup)
    for (const [dir, e] of Object.entries(envs))
      uploads.push({ secret: `useframe-dev-${path.basename(dir)}`, content: e.raw, keys: Object.keys(e.vars).length, labels: "app=useframe,env=dev" });

  const rows = [];
  for (const u of uploads) {
    if (opts.dryRun) {
      rows.push([u.secret, u.keys, "-", "dry-run"]);
      continue;
    }
    const exists = gcloud(["secrets", "describe", u.secret, `--project=${opts.project}`, "--format=value(name)"], { allowFail: true }).status === 0;
    let status = "unchanged";
    if (!exists) {
      gcloud(["secrets", "create", u.secret, `--project=${opts.project}`, "--replication-policy=automatic", `--labels=${u.labels}`]);
      status = "created";
    }
    const current = exists ? gcloud(["secrets", "versions", "access", "latest", `--secret=${u.secret}`, `--project=${opts.project}`], { allowFail: true }) : null;
    if (!current || current.status !== 0 || current.stdout !== u.content) {
      gcloud(["secrets", "versions", "add", u.secret, `--project=${opts.project}`, "--data-file=-"], { input: u.content });
      if (status !== "created") status = "updated";
    }
    const version = gcloud(["secrets", "versions", "describe", "latest", `--secret=${u.secret}`, `--project=${opts.project}`, "--format=value(name)"]).stdout.trim().split("/").pop();
    rows.push([u.secret, u.keys, version, status]);
  }

  const w = Math.max(...rows.map((r) => r[0].length));
  console.log(`\n${"secret".padEnd(w)}  keys  version  status`);
  for (const [s, k, v, st] of rows) console.log(`${s.padEnd(w)}  ${String(k).padStart(4)}  ${String(v).padStart(7)}  ${st}`);
}

try {
  main();
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}
