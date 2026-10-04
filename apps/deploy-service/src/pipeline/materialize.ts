import { chown, cp, lchown, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GeneratedFile } from "@repo/site-builder";
import { DeployError } from "./errors.js";

export type Owner = { uid: number; gid: number } | null;

export type WorkDirs = { base: string; src: string; home: string; npmCache: string };

export function safeJoin(root: string, rel: string): string {
  if (path.isAbsolute(rel) || rel.includes("\\") || rel.split("/").some((s) => s === ".." || s === "")) {
    throw new DeployError("Project contains an invalid file path.", rel);
  }
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root) + path.sep)) {
    throw new DeployError("Project contains an invalid file path.", rel);
  }
  return full;
}

export async function chownTree(dir: string, owner: Owner): Promise<void> {
  if (!owner) return;
  await chown(dir, owner.uid, owner.gid);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await chownTree(full, owner);
    else await lchown(full, owner.uid, owner.gid);
  }
}

export async function prepareWorkDir(
  workDir: string,
  deploymentId: string,
  owner: Owner,
): Promise<WorkDirs> {
  const base = path.join(workDir, deploymentId);
  const dirs: WorkDirs = {
    base,
    src: path.join(base, "src"),
    home: path.join(base, "home"),
    npmCache: path.join(workDir, ".npm-cache"),
  };
  await rm(base, { recursive: true, force: true });
  // 0711: the build user must traverse into its own src/ but not list siblings.
  await mkdir(base, { recursive: true, mode: 0o711 });
  await mkdir(dirs.src, { mode: 0o700 });
  await mkdir(dirs.home, { mode: 0o700 });
  await mkdir(dirs.npmCache, { recursive: true, mode: 0o700 });
  if (owner) {
    await chown(dirs.src, owner.uid, owner.gid);
    await chown(dirs.home, owner.uid, owner.gid);
    await chown(dirs.npmCache, owner.uid, owner.gid);
  }
  return dirs;
}

export async function writeTree(root: string, files: GeneratedFile[], owner: Owner): Promise<void> {
  for (const file of files) {
    const full = safeJoin(root, file.path);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await writeFile(full, file.content, { encoding: "utf-8", mode: 0o600 });
  }
  await chownTree(root, owner);
}

export async function copyTemplate(
  templatesRoot: string,
  hash: string,
  dest: string,
  owner: Owner,
): Promise<boolean> {
  const template = path.join(templatesRoot, hash, "node_modules");
  try {
    if (!(await stat(template)).isDirectory()) return false;
  } catch {
    return false;
  }
  const target = path.join(dest, "node_modules");
  await cp(template, target, { recursive: true, verbatimSymlinks: true });
  await chownTree(target, owner);
  return true;
}

export async function removeWorkDir(base: string): Promise<void> {
  await rm(base, { recursive: true, force: true, maxRetries: 3 });
}
