import { createHash } from "node:crypto";
import type { GeneratedFile } from "@repo/site-builder";
import { DeployError } from "./errors.js";

export type Framework = "NEXT_EXPORT" | "VITE_SPA";

export type Detected = { framework: Framework; outDir: string; mode: "n" | "s" };

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export function readPackageJson(files: GeneratedFile[]): PackageJson {
  const file = files.find((f) => f.path === "package.json");
  if (!file) throw new DeployError("Project has no package.json, so it cannot be built.");
  try {
    return JSON.parse(file.content) as PackageJson;
  } catch {
    throw new DeployError("Project package.json is not valid JSON.");
  }
}

export function detectFramework(files: GeneratedFile[]): Detected {
  const pkg = readPackageJson(files);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if ("next" in deps) {
    const config = files.find((f) => /^next\.config\.(js|mjs|cjs|ts)$/.test(f.path));
    if (!config || !/output\s*:\s*["']export["']/.test(config.content)) {
      throw new DeployError("Project is not static-export-ready (next.config must set output: \"export\").");
    }
    return { framework: "NEXT_EXPORT", outDir: "out", mode: "n" };
  }
  if ("vite" in deps) return { framework: "VITE_SPA", outDir: "dist", mode: "s" };
  throw new DeployError("Unsupported project type: expected a Next.js static export or a Vite app.");
}

function sorted(map: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(map ?? {}).sort(([a], [b]) => a.localeCompare(b)));
}

export function dependencyHash(pkg: PackageJson): string {
  const canonical = JSON.stringify({
    dependencies: sorted(pkg.dependencies),
    devDependencies: sorted(pkg.devDependencies),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}
