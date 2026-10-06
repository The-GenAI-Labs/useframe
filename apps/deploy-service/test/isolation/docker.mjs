// Cross-platform driver for `pnpm test:isolation` (works from Windows via Docker Desktop).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serviceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRoot = path.resolve(serviceDir, "../..");
const base = "useframe-local/deploy-service:isolation-base";
const image = "useframe-local/deploy-service:isolation-test";

function run(args) {
  const result = spawnSync("docker", args, { stdio: "inherit", env: { ...process.env, DOCKER_BUILDKIT: "1" } });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const extraCa = process.env.NODE_EXTRA_CA_CERTS;
const secret = extraCa && existsSync(extraCa) ? ["--secret", `id=extra_ca,src=${extraCa}`] : [];

run(["build", "-f", path.join(serviceDir, "Dockerfile"), "-t", base, ...secret, repoRoot]);
run(["build", "-f", path.join(serviceDir, "test", "isolation", "Dockerfile"), "--build-arg", `BASE_IMAGE=${base}`, "-t", image, repoRoot]);
// Mirrors the k8s worker pod: root with only CHOWN/SETUID/SETGID/DAC_OVERRIDE,
// no_new_privs, read-only root filesystem, writable work dir only.
run([
  "run",
  "--rm",
  "--cap-drop",
  "ALL",
  ...["CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE"].flatMap((c) => ["--cap-add", c]),
  "--security-opt",
  "no-new-privileges",
  "--read-only",
  "--tmpfs",
  "/work:rw,exec,size=4g",
  "--tmpfs",
  "/tmp:rw,exec",
  image,
]);
