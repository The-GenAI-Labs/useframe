import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  writeFile,
  mkdir,
  mkdtemp,
  readFile,
  cp,
  rm,
  rename,
  readdir,
  lstat,
  realpath,
  unlink,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot } from "@webcontainer/snapshot";

const execFileAsync = promisify(execFile);
const workerDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const templates = { "base-nextjs": "next" };

export async function prepareSnapshotBinaries(root) {
  const modules = path.join(root, "node_modules");
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await realpath(entryPath);
        const relativeTarget = path.relative(modules, target);
        if (
          path.basename(dir) !== ".bin" ||
          relativeTarget.startsWith("..") ||
          path.isAbsolute(relativeTarget)
        ) {
          throw new Error(`Unsupported snapshot symlink: ${entryPath}`);
        }
        const contents = await readFile(target);
        const isNode = /^#!.*\bnode\b/.test(
          contents.subarray(0, 128).toString().split("\n")[0],
        );
        // snapshot 0.1.0 rejects symlinks. Import the original entry point so
        // its relative imports still resolve from the package, not from .bin.
        const specifier = path.relative(dir, target).split(path.sep).join("/");
        await unlink(entryPath);
        await writeFile(
          entryPath,
          isNode
            ? `#!/usr/bin/env node\nimport(${JSON.stringify(specifier)}).catch(error => { console.error(error); process.exitCode = 1 })\n`
            : contents,
          { mode: 0o755 },
        );
      } else if (entry.isDirectory()) {
        await visit(entryPath);
      }
    }
  }
  await visit(modules);
}

export async function verifyBinary(root, binary) {
  const binaryPath = path.join(root, "node_modules", ".bin", binary);
  await lstat(binaryPath);
  const { stdout } = await execFileAsync(binaryPath, ["--version"], {
    cwd: root,
    timeout: 30_000,
  });
  if (!stdout.trim())
    throw new Error(`${binary}: executable returned no version`);
  console.log(`[${path.basename(root)}] ${stdout.trim()}`);
}

async function buildOne(name, binary, staging) {
  const source = path.join(workerDir, "templates", name);
  const templateDir = path.join(staging, name);
  await cp(source, templateDir, {
    recursive: true,
    filter: (file) =>
      !["node_modules", ".next", "out", "dist"].includes(path.basename(file)),
  });
  console.log(`[${name}] clean npm ci in ${templateDir}`);
  await execFileAsync(
    "npm",
    ["ci", "--include=dev", "--legacy-peer-deps", "--no-audit", "--no-fund"],
    {
      cwd: templateDir,
      timeout: 5 * 60_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  const installedBin = path.join(templateDir, "node_modules", ".bin", binary);
  if (!(await lstat(installedBin)).isSymbolicLink()) {
    throw new Error(
      `${name}: clean Linux install did not create .bin/${binary} as a symlink`,
    );
  }
  await verifyBinary(templateDir, binary);
  await prepareSnapshotBinaries(templateDir);
  await verifyBinary(templateDir, binary);
  console.log(`[${name}] validating production build...`);
  await execFileAsync("npm", ["run", "build"], {
    cwd: templateDir,
    timeout: 5 * 60_000,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  for (const output of [".next", "out", "dist"]) {
    await rm(path.join(templateDir, output), { recursive: true, force: true });
  }
  if (binary === "next") {
    // WebContainers use Next's WASM compiler, never the host's native SWC.
    await execFileAsync(
      process.execPath,
      [
        "-e",
        `
      const path = require('node:path');
      const { downloadWasmSwc } = require('next/dist/lib/download-swc');
      downloadWasmSwc(require('next/package.json').version,
        path.join(path.dirname(require.resolve('next/package.json')), 'wasm'))
        .catch(error => { console.error(error); process.exitCode = 1 });
    `,
      ],
      { cwd: templateDir, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const nextModules = path.join(templateDir, "node_modules", "@next");
    for (const entry of await readdir(nextModules)) {
      if (entry.startsWith("swc-") && !entry.startsWith("swc-wasm-")) {
        await rm(path.join(nextModules, entry), {
          recursive: true,
          force: true,
        });
      }
    }
  }
  console.log(`[${name}] building snapshot...`);
  const buf = await snapshot(templateDir);
  if (!buf.length)
    throw new Error(`${name}: snapshot() returned an empty buffer`);
  const outDir = path.join(workerDir, "snapshots");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, `${name}-v2.snapshot`);
  const tmpPath = `${outPath}.tmp`;
  await writeFile(tmpPath, buf);
  await rename(tmpPath, outPath);
  console.log(
    `[${name}] wrote ${outPath} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`,
  );
}

async function main() {
  if (
    process.platform !== "linux" ||
    Number(process.versions.node.split(".")[0]) < 20
  ) {
    throw new Error("Build snapshots with Node 20+ on Linux/WSL.");
  }
  const linuxHome = await realpath(homedir());
  if (linuxHome.startsWith("/mnt/"))
    throw new Error("Snapshot staging must use a native Linux home, not /mnt.");
  const staging = await mkdtemp(path.join(linuxHome, ".useframe-snapshots-"));
  const originalCwd = process.cwd();
  try {
    process.chdir(staging);
    for (const [name, binary] of Object.entries(templates))
      await buildOne(name, binary, staging);
  } finally {
    process.chdir(originalCwd);
    await rm(staging, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error("Snapshot build failed:", error);
    process.exitCode = 1;
  });
}
