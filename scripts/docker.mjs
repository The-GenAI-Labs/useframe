#!/usr/bin/env node
// Cross-platform (Windows PowerShell / Linux) build, smoke-test and push helper.
//   node scripts/docker.mjs list | build <svc|all> | smoke <svc|all> | push <svc|all> | context-check
//   node scripts/docker.mjs tags --service <svc> [--ref <git ref>] [--sha <sha>]   (used by CI)
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertPushable,
  computeTags,
  imageRefs,
  loadServices,
  namingMode,
  requireNamespace,
  selectServices,
} from "./docker-lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICES = loadServices(path.join(ROOT, "docker", "services.json"));
const BAD_OUTPUT = [
  /ERR_MODULE_NOT_FOUND/,
  /Cannot find (module|package)/,
  /ERR_REQUIRE_ESM/,
  /ERR_UNKNOWN_FILE_EXTENSION/,
  /ERR_IMPORT_ATTRIBUTE/,
  /query engine/i,
  /Unable to (load|require).*(engine|libquery)/i,
];

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  return result;
}

function must(cmd, args, options = {}) {
  const result = run(cmd, args, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} … exited with ${result.status}`);
  return result;
}

function git(args) {
  const result = run("git", args);
  return result.status === 0 ? result.stdout.trim() : "";
}

let cachedState;
// Computed once per run so one invocation never mixes tags if HEAD moves mid-build.
function gitState() {
  if (cachedState) return cachedState;
  const sha = process.env.GITHUB_SHA || git(["rev-parse", "HEAD"]);
  const dirty = !process.env.GITHUB_SHA && git(["status", "--porcelain"]) !== "";
  const tag = git(["describe", "--exact-match", "--tags", "HEAD"]);
  const ref = process.env.GITHUB_REF || (tag ? `refs/tags/${tag}` : git(["symbolic-ref", "-q", "HEAD"]));
  cachedState = { sha, ref, dirty };
  return cachedState;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function refsFor(service, state = gitState()) {
  const namespace = requireNamespace(process.env);
  const naming = namingMode(process.env);
  const tags = computeTags(state);
  return { tags, refs: imageRefs({ namespace, naming, service: service.name, tags }) };
}

function platforms() {
  return (process.env.DOCKER_PLATFORMS || "linux/amd64")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

function pnpmVersion() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return pkg.packageManager.split("@")[1];
}

function imageSizeMb(ref) {
  const out = run("docker", ["image", "inspect", "-f", "{{.Size}}", ref]);
  return out.status === 0 ? Math.round(Number(out.stdout.trim()) / 1024 / 1024) : NaN;
}

function build(service) {
  const { tags, refs } = refsFor(service);
  const state = gitState();
  const platform = platforms();
  if (platform.length > 1) {
    console.warn(`Local builds load one platform; using ${platform[0]}. Multi-platform images are built in CI.`);
  }
  const extraCa = process.env.NODE_EXTRA_CA_CERTS;
  const args = [
    "build",
    "-f",
    path.join(service.dir, "Dockerfile"),
    "--platform",
    platform[0],
    "--build-arg",
    `GIT_SHA=${state.sha}`,
    "--build-arg",
    `BUILD_DATE=${new Date().toISOString()}`,
    "--build-arg",
    `VERSION=${tags.find((t) => /^\d+\.\d+\.\d+$/.test(t)) ?? tags[0]}`,
    "--build-arg",
    `PNPM_VERSION=${pnpmVersion()}`,
    ...(process.env.NODE_VERSION ? ["--build-arg", `NODE_VERSION=${process.env.NODE_VERSION}`] : []),
    ...(process.env.NODE_IMAGE_DIGEST ? ["--build-arg", `NODE_IMAGE_DIGEST=${process.env.NODE_IMAGE_DIGEST}`] : []),
    ...(process.env.SOURCE_URL ? ["--build-arg", `SOURCE_URL=${process.env.SOURCE_URL}`] : []),
    ...(extraCa && existsSync(extraCa) ? ["--secret", `id=extra_ca,src=${extraCa}`] : []),
    ...refs.flatMap((r) => ["-t", r]),
    ".",
  ];
  console.log(`\n▶ ${service.name}: ${refs.join(", ")}`);
  must("docker", args, { env: { ...process.env, DOCKER_BUILDKIT: "1" } });
  console.log(`  size: ${imageSizeMb(refs[0])} MB`);
  return refs[0];
}

function check(results, name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function runContainer(ref, { user = "10001", command = [], entrypoint, env = {}, timeoutS = 30 } = {}) {
  const name = `uf-smoke-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const args = ["run", "--name", name, "--read-only", "--tmpfs", "/tmp:rw,exec", "--user", user];
  for (const [k, v] of Object.entries(env)) args.push("-e", `${k}=${v}`);
  if (entrypoint) args.push("--entrypoint", entrypoint);
  args.push(ref, ...command);
  const result = run("docker", args, { timeout: timeoutS * 1000 });
  run("docker", ["rm", "-f", name]);
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function smoke(service) {
  const { refs } = refsFor(service);
  const ref = refs[0];
  const results = [];
  console.log(`\n▶ smoke ${service.name} (${ref})`);

  const commands = service.commands ?? [[]];
  for (const command of commands) {
    const label = command.length ? command.join(" ") : "default CMD";
    const output = runContainer(ref, { command });
    const bad = BAD_OUTPUT.find((re) => re.test(output));
    const reachedValidation = /Invalid environment variables|DATABASE_URL|running on|started/i.test(output);
    check(
      results,
      `starts as 10001 with read-only root (${label})`,
      !bad && reachedValidation,
      bad ? `matched ${bad}` : reachedValidation ? "reached env validation" : output.trim().slice(0, 300),
    );
  }

  if (service.kind !== "migrate") {
    const resolver = [
      "const pkg = JSON.parse((await import('node:fs')).readFileSync('/app/package.json','utf8'));",
      "const fs = await import('node:fs');",
      "const names = Object.keys(pkg.dependencies||{}).filter(n => n.startsWith('@repo/') || n.startsWith('@useframe/'));",
      "const bad = [];",
      "for (const n of names) { try { const p = new URL(import.meta.resolve(n)).pathname; if (!p.includes('/dist/') || !fs.existsSync(p)) bad.push(n+' -> '+p); } catch (e) { bad.push(n+': '+e.code); } }",
      "if (names.includes('@useframe/db')) { const db = await import('@useframe/db'); if (typeof db.prisma?.$connect !== 'function') bad.push('prisma client not constructed'); }",
      "console.log(bad.length ? 'BAD '+bad.join('; ') : 'OK '+names.join(','));",
      "process.exit(0);",
    ].join(" ");
    const out = runContainer(ref, {
      entrypoint: "node",
      command: ["--input-type=module", "-e", resolver],
      env: { DATABASE_URL: "postgresql://smoke:smoke@127.0.0.1:1/smoke" },
    });
    check(results, "workspace packages resolve to dist/ (and Prisma client constructs)", /\bOK\b/.test(out) && !/\bBAD\b/.test(out), out.trim().split("\n").filter((l) => /OK|BAD|Error/.test(l)).join(" ").slice(0, 300));
  }

  const id = runContainer(ref, { entrypoint: "id", command: ["-u"] }).trim();
  check(results, "default user is uid 10001", id.split(/\s+/).includes("10001"), id);

  const contents = runContainer(ref, {
    entrypoint: "sh",
    command: [
      "-c",
      "test -e /repo && echo HAS_REPO; find -L /app/dist /app/src /app/node_modules/@repo /app/node_modules/@useframe /app/node_modules/.pnpm/@repo+*/node_modules/@repo/* /app/node_modules/.pnpm/@useframe+*/node_modules/@useframe/* -name '*.ts' ! -name '*.d.ts' 2>/dev/null | head -3; find /app -name '.env' -o -name '.env.*' | grep -v '.env.example' | head -3; command -v pnpm && echo HAS_PNPM; test -d /pnpm && echo HAS_STORE; echo DONE",
    ],
  });
  const leftovers = contents.split("\n").map((l) => l.trim()).filter((l) => l && l !== "DONE");
  check(results, "no /repo, own .ts sources, .env files or pnpm in the image", leftovers.length === 0, leftovers.join(", "));

  if (service.runsAsRoot) {
    const asRoot = runContainer(ref, { user: "0", entrypoint: "setpriv", command: ["--version"] });
    check(results, "runs as root with setpriv available", /setpriv/i.test(asRoot), asRoot.trim().split("\n")[0]);
    const rootStart = runContainer(ref, { user: "0", command: ["node", "dist/worker.js"] });
    check(results, "worker entry starts as root", !BAD_OUTPUT.some((re) => re.test(rootStart)) && /Invalid environment variables/.test(rootStart));
  }

  const limit = service.maxImageMb ?? Number(process.env.DOCKER_MAX_IMAGE_MB || 600);
  const size = imageSizeMb(ref);
  check(results, `image size ≤ ${limit} MB`, size <= limit, `${size} MB`);

  return results.every((r) => r.ok);
}

function push(service) {
  const state = gitState();
  if (state.dirty) throw new Error("Refusing to push: the working tree has uncommitted changes");
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream) throw new Error(`Refusing to push: branch ${branch} has no upstream`);
  if (git(["rev-list", "--count", `${upstream}..HEAD`]) !== "0") throw new Error("Refusing to push: HEAD is not pushed to its upstream");
  const info = run("docker", ["info", "--format", "{{json .}}"]);
  if (!/"IndexServerAddress"/.test(info.stdout) || !existsSync(path.join(process.env.USERPROFILE || process.env.HOME || "", ".docker", "config.json"))) {
    throw new Error("Refusing to push: log in to Docker Hub first (docker login)");
  }
  const { tags, refs } = refsFor(service, state);
  tags.forEach(assertPushable);
  for (const ref of refs) {
    must("docker", ["push", ref]);
    const digest = run("docker", ["image", "inspect", "-f", "{{join .RepoDigests \"\\n\"}}", ref]).stdout.trim();
    console.log(`  pushed ${ref}\n  digest ${digest.split("\n").find((d) => d.startsWith(ref.split(":")[0])) ?? digest}`);
  }
}

function contextCheck() {
  console.log("▶ build-context check (no .env, keys, .git or tfstate may reach a build)");
  must("docker", ["build", "--no-cache", "--progress=plain", "-f", "docker/context-check.Dockerfile", "."], {
    env: { ...process.env, DOCKER_BUILDKIT: "1" },
  });
}

const [command, target] = process.argv.slice(2).filter((a, i, all) => !(all[i - 1] ?? "").startsWith("--") && !a.startsWith("--"));
try {
  switch (command) {
    case "list": {
      for (const s of SERVICES) {
        let names;
        try {
          names = refsFor(s).refs.join("  ");
        } catch (err) {
          names = `(${err.message})`;
        }
        console.log(`${s.name.padEnd(22)} ${path.join(s.dir, "Dockerfile").padEnd(36)} ${names}`);
      }
      break;
    }
    case "matrix":
      console.log(JSON.stringify(selectServices(SERVICES, arg("--service") ?? "all")));
      break;
    case "tags": {
      const service = selectServices(SERVICES, arg("--service"))[0];
      const state = { ...gitState(), ...(arg("--ref") ? { ref: arg("--ref") } : {}), ...(arg("--sha") ? { sha: arg("--sha") } : {}) };
      console.log(refsFor(service, state).refs.join("\n"));
      break;
    }
    case "build": {
      const failed = [];
      for (const s of selectServices(SERVICES, target ?? "all")) {
        try {
          build(s);
        } catch (err) {
          console.error(`  ✖ ${s.name}: ${err.message}`);
          failed.push(s.name);
        }
      }
      if (failed.length) throw new Error(`Build failed: ${failed.join(", ")}`);
      break;
    }
    case "smoke": {
      const failed = selectServices(SERVICES, target ?? "all").filter((s) => !smoke(s));
      if (failed.length) throw new Error(`Smoke test failed: ${failed.map((s) => s.name).join(", ")}`);
      console.log("\nAll smoke tests passed");
      break;
    }
    case "push":
      for (const s of selectServices(SERVICES, target ?? "all")) push(s);
      break;
    case "context-check":
      contextCheck();
      break;
    default:
      console.error("Usage: node scripts/docker.mjs list | build <svc|all> | smoke <svc|all> | push <svc|all> | context-check | tags --service <svc>");
      process.exit(2);
  }
} catch (err) {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
}
