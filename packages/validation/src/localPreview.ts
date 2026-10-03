import { detectPreviewCommand } from "./previewCommand.js";
import { startKubernetesPreview } from "./kubernetesPreview.js";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import getPort from "get-port";

export async function startLocalPreview(
  files: { path: string; content: string }[],
  projectId: string,
  framework?: "vite" | "next",
) {
  const runDevScript = framework === undefined;
  framework ??= detectPreviewCommand(files).framework;
  if (process.env.KUBERNETES_SERVICE_HOST)
    return startKubernetesPreview(files, framework, runDevScript);
  const dir = await mkdtemp(path.join(tmpdir(), "useframe-validation-"));
  const port = await getPort({ host: "127.0.0.1" });
  const name = `validation-${randomUUID()}`;
  let logs = "";
  let exited = false;
  const command = (args: string[]) =>
    new Promise<void>((resolve, reject) => {
      const proc = spawn("docker", args, {
        windowsHide: true,
        stdio: "ignore",
      });
      proc.once("error", reject);
      proc.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`Preview cleanup exited ${code}`)),
      );
    });
  let killed = false;
  const kill = async () => {
    if (killed) return;
    killed = true;
    try {
      await command(["rm", "-f", name]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  try {
    let size = 0;
    for (const file of files) {
      const parts = file.path.split("/");
      if (
        file.path.includes("\\") ||
        file.path.includes(":") ||
        parts.some(
          (p) => !p || p === "." || p === ".." || p.startsWith(".env"),
        ) ||
        ["node_modules", ".git"].includes(parts[0]!)
      )
        throw new Error("Unsafe preview file path");
      size += Buffer.byteLength(file.content);
      if (size > 20 * 1024 * 1024)
        throw new Error("Preview exceeds 20MB source limit");
      const dest = path.join(dir, ...parts);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, file.content);
    }
    // Generated server code must never run with the worker's filesystem or cloud identity.
    const child = spawn(
      "docker",
      [
        "run",
        "--rm",
        "--name",
        name,
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges",
        "--pids-limit=256",
        "--memory=2g",
        "--cpus=2",
        "--network",
        "useframe-validation",
        "--user",
        "1000:1000",
        "--tmpfs",
        "/tmp:rw,exec,nosuid,size=1g,mode=1777",
        "-p",
        `127.0.0.1:${port}:3000`,
        "--mount",
        `type=bind,source=${dir},target=/input,readonly`,
        process.env.VALIDATION_PREVIEW_IMAGE ?? "useframe-validation:local",
        framework,
        ...(runDevScript ? ["script"] : []),
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const ready = new Promise<never>((_, reject) =>
      child.once("error", reject),
    );
    child.stdout.on("data", (b) => {
      logs = (logs + String(b)).slice(-8000);
    });
    child.stderr.on("data", (b) => {
      logs = (logs + String(b)).slice(-8000);
    });
    child.once("exit", () => {
      exited = true;
    });
    const url = `http://127.0.0.1:${port}`;
    await Promise.race([
      ready,
      (async () => {
        const deadline = Date.now() + 90000;
        while (Date.now() < deadline) {
          if (exited) throw new Error(`Preview failed to start: ${logs}`);
          try {
            await fetch(url, { signal: AbortSignal.timeout(1500) });
            return;
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        throw new Error(`Preview startup timed out for ${projectId}: ${logs}`);
      })(),
    ]);
    return { url, port, kill };
  } catch (error) {
    await kill().catch(() => {});
    throw error;
  }
}
export { deleteExpiredPreviewPods } from "./kubernetesPreview.js";
