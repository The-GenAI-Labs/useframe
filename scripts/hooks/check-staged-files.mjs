// Pre-commit guard: no real env files and no new files over 5 MB.
import { execFileSync } from "node:child_process";
import path from "node:path";

const MAX_NEW_FILE_BYTES = 5 * 1024 * 1024;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
const staged = (filter) => git("diff", "--cached", "--name-only", "-z", `--diff-filter=${filter}`).split("\0").filter(Boolean);

const isEnvFile = (file) => /^\.env(\..+)?$/.test(path.basename(file));
const isEnvExample = (file) => /^\.env(\.[^.]+)*\.example$/.test(path.basename(file));

const problems = [];

for (const file of staged("ACMR")) {
  if (isEnvFile(file) && !isEnvExample(file)) {
    problems.push(`${file}: env files hold secrets and must not be committed. Unstage it with "git restore --staged ${file}". Only .env.example and .env.*.example belong in git.`);
  }
}

for (const file of staged("A")) {
  const bytes = Number(git("cat-file", "-s", `:${file}`).trim());
  if (bytes > MAX_NEW_FILE_BYTES) {
    problems.push(`${file}: ${(bytes / 1024 / 1024).toFixed(1)} MB is over the 5 MB limit for new files. Keep large assets out of git (object storage, or generate them in the build).`);
  }
}

if (problems.length) {
  console.error("\nCommit blocked by the staged-files check:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}
