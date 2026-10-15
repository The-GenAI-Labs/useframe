// Pre-commit: type-check only the workspace packages that own staged files.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const staged = git("diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR").split("\0").filter(Boolean);

const packageNameFor = (file) => {
  let dir = path.posix.dirname(file);
  while (dir !== ".") {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) {
      const { name, scripts } = JSON.parse(readFileSync(manifest, "utf8"));
      return scripts?.typecheck ? name : null;
    }
    dir = path.posix.dirname(dir);
  }
  return null;
};

const packages = [...new Set(staged.filter((f) => /\.(ts|tsx|mts|cts)$/.test(f)).map(packageNameFor).filter(Boolean))];

if (!packages.length) process.exit(0);

try {
  execFileSync(
    "pnpm",
    ["exec", "turbo", "run", "typecheck", ...packages.map((p) => `--filter=${p}`), "--output-logs=errors-only", "--ui=stream"],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
} catch {
  process.exit(1);
}
