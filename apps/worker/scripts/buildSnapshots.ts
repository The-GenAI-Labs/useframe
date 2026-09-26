import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testMode = process.argv.includes("--test");
const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  testMode ? "buildSnapshotsWsl.test.mjs" : "buildSnapshotsWsl.mjs",
);
const linuxScript = script
  .replace(/^([A-Za-z]):/, (_, drive: string) => `/mnt/${drive.toLowerCase()}`)
  .replace(/\\/g, "/");

// The builder stages installs in the Linux home. Only sources and finished
// artifacts cross the Windows filesystem boundary.
const result =
  process.platform === "win32"
    ? spawnSync(
        "wsl.exe",
        [
          "-d",
          "Ubuntu-22.04",
          "--cd",
          "~",
          "-e",
          "bash",
          "-c",
          'export PATH="$HOME/.local/node20/bin:$PATH"; exec node --max-old-space-size=6144 "$@"',
          "--",
          ...(testMode ? ["--test"] : []),
          linuxScript,
        ],
        { stdio: "inherit" },
      )
    : spawnSync(
        process.execPath,
        ["--max-old-space-size=6144", ...(testMode ? ["--test"] : []), script],
        { stdio: "inherit" },
      );

if (result.error)
  console.error("Failed to launch snapshot builder:", result.error);
process.exit(result.status ?? 1);
