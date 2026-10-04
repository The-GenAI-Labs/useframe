import { link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildChildEnv, isolatedCommand, runChild } from "@/pipeline/build.js";
import { DeployError } from "@/pipeline/errors.js";
import { verifyOutput } from "@/pipeline/verifyOutput.js";
import { probeDeployment } from "@/pipeline/probe.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "uf-deploy-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("build child environment", () => {
  it("passes only the allowlist, never secrets", () => {
    process.env.CLOUDFLARE_API_TOKEN = "leak";
    process.env.SITES_R2_SECRET_ACCESS_KEY = "leak";
    process.env.DATABASE_URL = "leak";
    const env = buildChildEnv({ home: "/w/home", npmCache: "/w/.npm", path: "/usr/bin", platform: "linux" });
    expect(Object.keys(env).sort()).toEqual(
      ["CI", "HOME", "NEXT_TELEMETRY_DISABLED", "NODE_OPTIONS", "PATH", "npm_config_cache"].sort(),
    );
    expect(JSON.stringify(env)).not.toContain("leak");
  });

  it("wraps commands in setpriv with no supplementary groups and no new privileges", () => {
    expect(isolatedCommand("setpriv", 10002, 10002, "npm", ["run", "build"])).toEqual({
      file: "setpriv",
      args: ["--reuid=10002", "--regid=10002", "--clear-groups", "--no-new-privs", "--", "npm", "run", "build"],
    });
    expect(isolatedCommand("none", 1, 1, "npm", ["ci"])).toEqual({ file: "npm", args: ["ci"] });
  });
});

describe("runChild", () => {
  it("kills the whole process tree on timeout", async () => {
    const pidFile = path.join(dir, "grandchild.pid");
    await writeFile(
      path.join(dir, "parent.js"),
      `const { spawn } = require("node:child_process");
       const g = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
       require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
       console.log("started");
       setInterval(() => {}, 1000);`,
    );
    const result = await runChild({
      command: "node",
      args: ["parent.js"],
      cwd: dir,
      env: buildChildEnv({ home: dir, npmCache: dir, path: process.env.PATH }),
      timeoutMs: 1500,
      isolation: "none",
      uid: 0,
      gid: 0,
    });
    expect(result.timedOut).toBe(true);
    expect(result.output).toContain("started");
    const grandchild = Number(await readFile(pidFile, "utf-8"));
    await new Promise((r) => setTimeout(r, 500));
    expect(() => process.kill(grandchild, 0)).toThrow();
  }, 15_000);

  it("keeps only the tail of large output", async () => {
    await writeFile(path.join(dir, "noisy.js"), `process.stdout.write("x".repeat(200000) + "END")`);
    const result = await runChild({
      command: "node",
      args: ["noisy.js"],
      cwd: dir,
      env: buildChildEnv({ home: dir, npmCache: dir, path: process.env.PATH }),
      timeoutMs: 10_000,
      isolation: "none",
      uid: 0,
      gid: 0,
      maxOutputBytes: 1024,
    });
    expect(result.code).toBe(0);
    expect(result.output.length).toBeLessThanOrEqual(1024);
    expect(result.output.endsWith("END")).toBe(true);
  }, 15_000);

  it("cannot see the parent's secrets", async () => {
    process.env.CLOUDFLARE_API_TOKEN = "leak";
    await writeFile(path.join(dir, "env.js"), `console.log(JSON.stringify(process.env))`);
    const result = await runChild({
      command: "node",
      args: ["env.js"],
      cwd: dir,
      env: buildChildEnv({ home: dir, npmCache: dir, path: process.env.PATH }),
      timeoutMs: 10_000,
      isolation: "none",
      uid: 0,
      gid: 0,
    });
    expect(result.output).not.toContain("leak");
    expect(result.output).not.toContain("CLOUDFLARE");
  }, 15_000);
});

describe("verifyOutput", () => {
  const limits = { maxFiles: 10, maxTotalBytes: 1024 * 1024 };

  async function out(files: Record<string, string>) {
    const root = path.join(dir, "out");
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await writeFile(path.join(root, rel), content);
    }
    return root;
  }

  it("lists files, totals bytes and hashes index.html", async () => {
    const root = await out({ "index.html": "<h1>hi</h1>", "assets/a.js": "a()" });
    const result = await verifyOutput(root, limits);
    expect(result.fileCount).toBe(2);
    expect(result.totalBytes).toBe(14);
    expect(result.rootHtmlSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("skips secrets-looking files", async () => {
    const root = await out({ "index.html": "x", ".env.local": "K=V", "keys/server.pem": "x", "id_rsa": "x" });
    const result = await verifyOutput(root, limits);
    expect(result.files.map((f) => f.relPath)).toEqual(["index.html"]);
    expect(result.skipped.sort()).toEqual([".env.local", "id_rsa", "keys/server.pem"]);
  });

  it("requires index.html at the root", async () => {
    const root = await out({ "about/index.html": "x" });
    await expect(verifyOutput(root, limits)).rejects.toThrow(/index.html/);
  });

  it("enforces file count and size limits", async () => {
    const root = await out({ "index.html": "x", "a.txt": "x", "b.txt": "x" });
    await expect(verifyOutput(root, { maxFiles: 2, maxTotalBytes: 1e6 })).rejects.toThrow(/more than 2 files/);
    await expect(verifyOutput(root, { maxFiles: 10, maxTotalBytes: 2 })).rejects.toThrow(/larger than/);
  });

  it("rejects hard links", async () => {
    const root = await out({ "index.html": "x" });
    await writeFile(path.join(dir, "secret.txt"), "credentials");
    await link(path.join(dir, "secret.txt"), path.join(root, "copied.txt"));
    await expect(verifyOutput(root, limits)).rejects.toThrow(/hard link/);
  });

  it("rejects symlinks", async (ctx) => {
    const root = await out({ "index.html": "x" });
    await writeFile(path.join(dir, "secret.txt"), "credentials");
    try {
      await symlink(path.join(dir, "secret.txt"), path.join(root, "leak.txt"));
    } catch {
      ctx.skip();
    }
    await expect(verifyOutput(root, limits)).rejects.toBeInstanceOf(DeployError);
  });
});

describe("activation probe", () => {
  it("waits through the previous deployment and 404s until the header matches", async () => {
    const answers = [
      new Response("", { status: 404 }),
      new Response("", { status: 200, headers: { "x-useframe-deployment": "old" } }),
      new Response("", { status: 200, headers: { "x-useframe-deployment": "new" } }),
    ];
    const result = await probeDeployment({
      url: "https://acme.useframe.in/",
      deploymentId: "new",
      timeoutMs: 10_000,
      fetchImpl: (async () => answers.shift()!) as typeof fetch,
      sleep: async () => undefined,
    });
    expect(result).toMatchObject({ ok: true, attempts: 3 });
  });

  it("gives up after the timeout", async () => {
    let t = 0;
    const result = await probeDeployment({
      url: "https://acme.useframe.in/",
      deploymentId: "new",
      timeoutMs: 9000,
      fetchImpl: (async () => new Response("", { status: 404 })) as typeof fetch,
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
    });
    expect(result.ok).toBe(false);
    expect(result.lastStatus).toBe(404);
  });
});
