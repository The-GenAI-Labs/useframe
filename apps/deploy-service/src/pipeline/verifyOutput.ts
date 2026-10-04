import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { DeployError } from "./errors.js";

export type OutputFile = { relPath: string; absPath: string; size: number };

export type VerifiedOutput = {
  files: OutputFile[];
  skipped: string[];
  fileCount: number;
  totalBytes: number;
  rootHtmlSha256: string;
};

export type OutputLimits = { maxFiles: number; maxTotalBytes: number };

const MAX_KEY_BYTES = 900;

export function isDeniedPath(relPath: string): boolean {
  const segments = relPath.split("/");
  const name = segments[segments.length - 1] ?? "";
  return (
    segments.includes(".git") ||
    name.startsWith(".env") ||
    name.endsWith(".pem") ||
    name.startsWith("id_rsa")
  );
}

export async function verifyOutput(outDir: string, limits: OutputLimits): Promise<VerifiedOutput> {
  let root: string;
  try {
    root = await realpath(outDir);
  } catch {
    throw new DeployError("The build did not produce an output folder.");
  }
  const files: OutputFile[] = [];
  const skipped: string[] = [];
  let totalBytes = 0;

  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      const info = await lstat(abs);
      if (info.isSymbolicLink()) throw new DeployError("Build output contains a symbolic link.", rel);
      if (info.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!info.isFile()) throw new DeployError("Build output contains an unsupported file type.", rel);
      if (info.nlink > 1) throw new DeployError("Build output contains a hard link.", rel);
      const real = await realpath(abs);
      if (!real.startsWith(root + path.sep)) {
        throw new DeployError("Build output points outside the output folder.", rel);
      }
      if (isDeniedPath(rel)) {
        skipped.push(rel);
        continue;
      }
      if (Buffer.byteLength(rel) > MAX_KEY_BYTES) throw new DeployError("Build output has a path that is too long.", rel);
      files.push({ relPath: rel, absPath: abs, size: info.size });
      totalBytes += info.size;
      if (files.length > limits.maxFiles) {
        throw new DeployError(`Build output has more than ${limits.maxFiles} files.`);
      }
      if (totalBytes > limits.maxTotalBytes) {
        throw new DeployError(`Build output is larger than ${Math.round(limits.maxTotalBytes / 1048576)} MB.`);
      }
    }
  }

  await walk(root);
  const index = files.find((f) => f.relPath === "index.html");
  if (!index) throw new DeployError("The build output has no index.html at its root.");
  const rootHtmlSha256 = createHash("sha256").update(await readFile(index.absPath)).digest("hex");
  return { files, skipped, fileCount: files.length, totalBytes, rootHtmlSha256 };
}
