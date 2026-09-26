import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withScaffold } from "./nextScaffold";

const mocks = vi.hoisted(() => ({
  setState: vi.fn(),
  boot: vi.fn(),
  mount: vi.fn(),
  spawn: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  rm: vi.fn(),
  off: vi.fn(),
  ready: null as null | ((port: number, url: string) => void),
}));
vi.mock("react", () => ({
  useState: () => [{ status: "idle" }, mocks.setState],
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useRef: () => ({ current: null }),
}));
vi.mock("@webcontainer/api", () => ({ WebContainer: { boot: mocks.boot } }));

const files = [
  {
    path: "app/page.tsx",
    content: "export default function Page() { return <main>Hello</main> }",
  },
];
const packageJson = withScaffold(files).find(
  (file) => file.path === "package.json",
)!.content;
let stop: (() => void) | undefined;

function processResult(code?: number, output = "") {
  let exit: (code: number) => void = () => {};
  return {
    exit:
      code === undefined
        ? new Promise<number>((resolve) => {
            exit = resolve;
          })
        : Promise.resolve(code),
    kill: vi.fn(() => exit(143)),
    output: new ReadableStream<string>({
      start(controller) {
        controller.enqueue(output);
        controller.close();
      },
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.readdir.mockResolvedValue([]);
  mocks.rm.mockResolvedValue(undefined);
  mocks.mount.mockResolvedValue(undefined);
  mocks.readFile.mockImplementation(async (path: string) =>
    path === "package.json" ? packageJson : "#!/usr/bin/env node",
  );
  mocks.boot.mockResolvedValue({
    mount: mocks.mount,
    spawn: mocks.spawn,
    fs: { readFile: mocks.readFile, readdir: mocks.readdir, rm: mocks.rm },
    on: (_event: string, listener: typeof mocks.ready) => {
      mocks.ready = listener;
      return mocks.off;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array([1]))),
  );
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function hook() {
  const { useNextWebContainer } = await import("./useNextWebContainer");
  const result = useNextWebContainer();
  stop = result.stop;
  return result;
}

describe("Next.js preview lifecycle", () => {
  it("reports an installation failure without starting the dev server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    mocks.spawn.mockResolvedValue(processResult(1, "Registry unavailable"));
    await (await hook()).boot(files);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.setState.mock.lastCall?.[0].message).toContain(
      "Registry unavailable",
    );
  });

  it("discards a corrupt snapshot before installing clean dependencies", async () => {
    mocks.mount.mockRejectedValueOnce(new Error("Invalid snapshot"));
    mocks.readdir.mockResolvedValue(["package-lock.json", "node_modules"]);
    mocks.spawn.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === "install") return processResult(0);
      queueMicrotask(() => mocks.ready?.(3000, "https://preview.example"));
      return processResult();
    });
    await (await hook()).boot(files);
    expect(mocks.rm).toHaveBeenCalledWith("node_modules", {
      recursive: true,
      force: true,
    });
    expect(mocks.spawn.mock.calls[0][1][0]).toBe("install");
    expect(mocks.setState.mock.lastCall?.[0].status).toBe("ready");
  });

  it("rejects a snapshot with incompatible dependency versions", async () => {
    mocks.readFile.mockImplementation(async (path: string) =>
      path === "package.json" ? "{}" : "#!/usr/bin/env node",
    );
    mocks.spawn.mockResolvedValue(processResult(1, "Install failed"));
    await (await hook()).boot(files);
    expect(mocks.spawn.mock.calls[0][1][0]).toBe("install");
  });

  it("reports an immediate exit without waiting for server-ready, and strips terminal escapes", async () => {
    mocks.spawn.mockResolvedValue(
      processResult(127, "\u001b[1Gsh: next: command not found\u001b[0K"),
    );
    await (await hook()).boot(files);
    expect(mocks.setState).toHaveBeenLastCalledWith({
      status: "error",
      message:
        "Next.js dev server exited (code 127).\nsh: next: command not found",
    });
    expect(mocks.off).toHaveBeenCalled();
  });

  it("installs from scratch when the snapshot has no launcher", async () => {
    mocks.readFile.mockRejectedValue(new Error("ENOENT"));
    mocks.spawn.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === "install") return processResult(0);
      queueMicrotask(() => mocks.ready?.(3000, "https://preview.example"));
      return processResult();
    });
    await (await hook()).boot(files);
    expect(mocks.spawn.mock.calls[0][1][0]).toBe("install");
    expect(mocks.setState).toHaveBeenLastCalledWith({
      status: "ready",
      url: "https://preview.example",
    });
  });

  it("cleans up a dev process that never becomes ready", async () => {
    vi.useFakeTimers();
    const proc = processResult();
    mocks.spawn.mockResolvedValue(proc);
    const pending = (await hook()).boot(files);
    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(120_001);
    await pending;
    expect(proc.kill).toHaveBeenCalled();
    expect(mocks.setState.mock.lastCall?.[0].message).toContain(
      "didn't start in time",
    );
  });

  it("kills the process and removes the listener when the preview is stopped", async () => {
    const proc = processResult();
    mocks.spawn.mockImplementation(async () => {
      queueMicrotask(() => mocks.ready?.(3000, "https://preview.example"));
      return proc;
    });
    const preview = await hook();
    await preview.boot(files);
    preview.stop();
    expect(proc.kill).toHaveBeenCalled();
    expect(mocks.off).toHaveBeenCalled();
  });

  it("allows retrying a failed WebContainer boot", async () => {
    const wc = await mocks.boot();
    mocks.boot
      .mockReset()
      .mockRejectedValueOnce(new Error("Boot failed"))
      .mockResolvedValue(wc);
    mocks.spawn.mockResolvedValue(processResult(127));
    const preview = await hook();
    await preview.boot(files);
    await preview.boot(files);
    expect(mocks.boot).toHaveBeenCalledTimes(2);
    expect(mocks.spawn).toHaveBeenCalled();
  });
});
