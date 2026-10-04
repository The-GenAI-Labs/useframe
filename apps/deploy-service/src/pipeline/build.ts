import { spawn, spawnSync } from "node:child_process";

export type Isolation = "setpriv" | "none";

export type ChildResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  output: string;
};

export type RunChildOptions = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  isolation: Isolation;
  uid: number;
  gid: number;
  maxOutputBytes?: number;
  platform?: NodeJS.Platform;
};

const MAX_OUTPUT = 64 * 1024;

// --legacy-peer-deps: the Replicate scaffold pins next@15.0.3 with react@19.0.0,
// whose declared peer range excludes stable React 19, so strict resolution fails.
export const INSTALL_ARGS = [
  "install",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "--prefer-offline",
  "--legacy-peer-deps",
];


// Allowlist only: no CLOUDFLARE_*, SITES_R2_*, DB, Redis or API keys ever reach the build.
export function buildChildEnv(opts: {
  home: string;
  npmCache: string;
  path: string | undefined;
  platform?: NodeJS.Platform;
}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: opts.path ?? "/usr/local/bin:/usr/bin:/bin",
    HOME: opts.home,
    CI: "1",
    NODE_OPTIONS: "--max-old-space-size=2048",
    NEXT_TELEMETRY_DISABLED: "1",
    npm_config_cache: opts.npmCache,
  };
  if ((opts.platform ?? process.platform) === "win32") {
    // Windows cannot spawn npm.cmd without these; none of them carry secrets.
    for (const name of ["SystemRoot", "ComSpec", "PATHEXT", "WINDIR"]) {
      const value = process.env[name];
      if (value) env[name] = value;
    }
    env.USERPROFILE = opts.home;
    env.APPDATA = opts.home;
    env.TEMP = opts.home;
    env.TMP = opts.home;
  }
  return env;
}

export function isolatedCommand(
  isolation: Isolation,
  uid: number,
  gid: number,
  command: string,
  args: string[],
): { file: string; args: string[] } {
  if (isolation === "none") return { file: command, args };
  return {
    file: "setpriv",
    args: [`--reuid=${uid}`, `--regid=${gid}`, "--clear-groups", "--no-new-privs", "--", command, ...args],
  };
}

export function killTree(
  pid: number,
  platform: NodeJS.Platform = process.platform,
  asUser?: { uid: number; gid: number },
): void {
  if (platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
    return;
  }
  // The worker holds no CAP_KILL, so it cannot signal the build uid's processes
  // directly; a process running as that same uid can.
  if (asUser) {
    spawnSync(
      "setpriv",
      [
        `--reuid=${asUser.uid}`,
        `--regid=${asUser.gid}`,
        "--clear-groups",
        "--no-new-privs",
        "--",
        process.execPath,
        "-e",
        `try { process.kill(-${pid}, "SIGKILL") } catch {}`,
      ],
      { stdio: "ignore" },
    );
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // EPERM (other uid) or already gone
  }
}

export function runChild(options: RunChildOptions): Promise<ChildResult> {
  const platform = options.platform ?? process.platform;
  const max = options.maxOutputBytes ?? MAX_OUTPUT;
  const { file, args } = isolatedCommand(
    options.isolation,
    options.uid,
    options.gid,
    options.command,
    options.args,
  );

  // Node refuses to spawn .cmd shims (npm on Windows) without a shell, so Windows
  // gets one quoted command line; args here are constants, never user input.
  const windows = platform === "win32";
  const quote = (s: string) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
  const spawnFile = windows ? [file, ...args].map(quote).join(" ") : file;
  const spawnArgs = windows ? [] : args;

  return new Promise((resolve, reject) => {
    const child = spawn(spawnFile, spawnArgs, {
      cwd: options.cwd,
      env: options.env,
      detached: !windows,
      shell: windows,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    const append = (chunk: Buffer) => {
      output += chunk.toString("utf-8");
      if (output.length > max * 2) output = output.slice(-max);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        killTree(
          child.pid,
          platform,
          options.isolation === "setpriv" ? { uid: options.uid, gid: options.gid } : undefined,
        );
      }
    }, options.timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, timedOut, output: output.slice(-max) });
    });
  });
}
