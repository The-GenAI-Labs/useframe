// Runs inside the deploy-service image as root with the k8s worker's capability set
// (`pnpm --filter @useframe/deploy-service test:isolation`). Imports the image's compiled /app/dist.
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildChildEnv, runChild } from "/app/dist/pipeline/build.js";
import { dependencyHash, detectFramework, readPackageJson } from "/app/dist/pipeline/detect.js";
import { filesFromVersion } from "/app/dist/pipeline/files.js";
import { copyTemplate, prepareWorkDir, removeWorkDir, writeTree } from "/app/dist/pipeline/materialize.js";
import { FIXTURE_SPEC } from "/app/dist/pipeline/templates.js";
import { verifyOutput } from "/app/dist/pipeline/verifyOutput.js";

const UID = 10002;
const GID = 10002;
const owner = { uid: UID, gid: GID };
let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

process.env.CLOUDFLARE_API_TOKEN = "leak-cloudflare";
process.env.SITES_R2_SECRET_ACCESS_KEY = "leak-r2";
process.env.DATABASE_URL = "postgres://leak";

check("setpriv is installed", execFileSync("sh", ["-c", "command -v setpriv"]).toString().trim() !== "");
check("worker runs as root (needed to switch uid)", process.getuid?.() === 0);

await mkdir("/tmp/secrets", { recursive: true });
await writeFile("/tmp/secrets/token", "credential");
await chmod("/tmp/secrets", 0o700);
await chmod("/tmp/secrets/token", 0o600);

const dirs = await prepareWorkDir("/work", "isolation", owner);
const probeScript = `
const fs = require("node:fs");
const { execSync } = require("node:child_process");
const out = {
  uid: process.getuid(), gid: process.getgid(), groups: process.getgroups(),
  env: Object.keys(process.env).sort(),
  leaked: Object.values(process.env).some((v) => String(v).startsWith("leak")) || fs.readFileSync("/proc/self/environ", "utf8").includes("leak"),
  readSecret: (() => { try { fs.readFileSync("/tmp/secrets/token"); return true } catch { return false } })(),
  writeRoot: (() => { try { fs.writeFileSync("/etc/pwned", "x"); return true } catch { return false } })(),
  nnp: fs.readFileSync("/proc/self/status", "utf8").match(/NoNewPrivs:\\s+(\\d)/)?.[1],
  parentEnv: (() => { try { return fs.readFileSync("/proc/1/environ", "utf8").includes("leak") } catch { return false } })(),
};
console.log("RESULT" + JSON.stringify(out));
`;
await writeFile(path.join(dirs.src, "probe.js"), probeScript);
const env = buildChildEnv({ home: dirs.home, npmCache: dirs.npmCache, path: process.env.PATH });
const probe = await runChild({
  command: "node",
  args: ["probe.js"],
  cwd: dirs.src,
  env,
  timeoutMs: 20_000,
  isolation: "setpriv",
  uid: UID,
  gid: GID,
});
const result = JSON.parse(probe.output.split("RESULT")[1] ?? "{}");
if (result.uid === undefined) console.log(probe.output);
check("build child runs as uid/gid 10002", result.uid === UID && result.gid === GID, `${result.uid}/${result.gid}`);
check("build child has no supplementary groups", JSON.stringify(result.groups) === JSON.stringify([GID]) || JSON.stringify(result.groups) === "[]", JSON.stringify(result.groups));
check("build env is the allowlist only", !result.leaked, JSON.stringify(result.env));
check("build cannot read root-only secrets", result.readSecret === false);
check("build cannot write outside the work dir", result.writeRoot === false);
check("no_new_privs is set", result.nnp === "1");
check("build cannot read the worker's environment", result.parentEnv === false);

await writeFile(
  path.join(dirs.src, "hang.js"),
  `require("node:child_process").spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { stdio: "ignore" }); setInterval(()=>{},1000);`,
);
const hang = await runChild({
  command: "node",
  args: ["hang.js"],
  cwd: dirs.src,
  env,
  timeoutMs: 1500,
  isolation: "setpriv",
  uid: UID,
  gid: GID,
});
await new Promise((r) => setTimeout(r, 500));
const survivors = execFileSync("sh", ["-c", `ps -eo uid=,args= | awk '$1 == ${UID}' | grep -v awk || true`]).toString().trim();
check("timeout kills the whole build process tree", hang.timedOut && survivors === "", survivors);
await removeWorkDir(dirs.base);

// A real Vite build of a generated site, offline, from the baked template.
const site = await prepareWorkDir("/work", "vite-build", owner);
const files = filesFromVersion({ snapshot: FIXTURE_SPEC(2), nextFiles: null }, "https://acme-x7k.useframe.in");
const detected = detectFramework(files);
await writeTree(site.src, files, owner);
const usedTemplate = await copyTemplate(
  process.env.DEPLOY_NODE_MODULES_TEMPLATES ?? "/opt/templates",
  dependencyHash(readPackageJson(files)),
  site.src,
  owner,
);
check("compiler dependency set matches a baked template", usedTemplate);
const build = await runChild({
  command: "npm",
  args: ["run", "build"],
  cwd: site.src,
  env: buildChildEnv({ home: site.home, npmCache: site.npmCache, path: process.env.PATH }),
  timeoutMs: 300_000,
  isolation: "setpriv",
  uid: UID,
  gid: GID,
});
check("vite build succeeds as the build user", build.code === 0, build.code === 0 ? "" : build.output.slice(-2000));
if (build.code === 0) {
  const output = await verifyOutput(path.join(site.src, detected.outDir), { maxFiles: 5000, maxTotalBytes: 100 * 1048576 });
  const robots = await readFile(path.join(site.src, "dist", "robots.txt"), "utf-8");
  check("output verified with index.html", output.fileCount > 1, `${output.fileCount} files, ${output.totalBytes} bytes`);
  check("robots.txt carries the real site URL", robots.includes("https://acme-x7k.useframe.in/sitemap.xml"));
}
await removeWorkDir(site.base);

console.log(failures ? `\n${failures} isolation check(s) failed` : "\nAll isolation checks passed");
process.exit(failures ? 1 : 0);
