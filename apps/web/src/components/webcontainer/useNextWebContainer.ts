"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type {
  FileSystemTree,
  WebContainer,
  WebContainerProcess,
} from "@webcontainer/api";
import { withScaffold, type ReplicationNextFile } from "./nextScaffold";

type WCState =
  | { status: "idle" }
  | { status: "booting" }
  | { status: "installing" }
  | { status: "starting" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

const API_SERVICE_URL =
  process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";
const SNAPSHOT_URL = `${API_SERVICE_URL}/api/webcontainer-snapshot/base-nextjs?v=2`;
let wcBootPromise: Promise<WebContainer> | null = null;
let setupQueue: Promise<void> = Promise.resolve();
let cancelActive: (() => void) | null = null;
let runningProcess: WebContainerProcess | null = null;

async function getWebContainer() {
  if (!wcBootPromise) {
    wcBootPromise = import("@webcontainer/api")
      .then(({ WebContainer }) => WebContainer.boot())
      .catch((error: unknown) => {
        wcBootPromise = null;
        throw error;
      });
  }
  return wcBootPromise;
}

async function fetchBaseSnapshot(
  signal: AbortSignal,
): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(SNAPSHOT_URL, {
      cache: "no-cache",
      signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength ? buf : null;
  } catch {
    signal.throwIfAborted();
    return null;
  }
}

function buildFsTree(files: ReplicationNextFile[]): FileSystemTree {
  const tree: FileSystemTree = Object.create(null);
  for (const { path, content } of files) {
    const parts = path.split("/");
    const fileName = parts.pop()!;
    let cursor = tree;
    for (const dir of parts) {
      const existing = cursor[dir];
      if (existing && "directory" in existing) cursor = existing.directory;
      else {
        const directory: FileSystemTree = Object.create(null);
        cursor[dir] = { directory };
        cursor = directory;
      }
    }
    cursor[fileName] = { file: { contents: content } };
  }
  return tree;
}

function captureOutput(proc: WebContainerProcess) {
  let log = "";
  const done = proc.output
    .pipeTo(
      new WritableStream<string>({
        write(chunk) {
          log = (log + chunk).slice(-8000);
        },
      }),
    )
    .catch(() => {});
  return {
    done,
    text: () =>
      log
        .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
        .trim()
        .slice(-2000),
  };
}

async function runCommand(
  wc: WebContainer,
  args: string[],
  signal: AbortSignal,
  timeoutMs: number,
) {
  signal.throwIfAborted();
  const proc = await wc.spawn("npm", args);
  const output = captureOutput(proc);
  const kill = () => proc.kill();
  signal.addEventListener("abort", kill, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    signal.throwIfAborted();
    const exitCode = await Promise.race([
      proc.exit,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          kill();
          reject(
            new Error(`npm ${args.join(" ")} timed out.\n${output.text()}`),
          );
        }, timeoutMs);
      }),
    ]);
    await output.done;
    signal.throwIfAborted();
    if (exitCode !== 0)
      throw new Error(
        `npm ${args.join(" ")} failed (code ${exitCode}).\n${output.text()}`,
      );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", kill);
    if (signal.aborted) kill();
  }
}

export function useNextWebContainer() {
  const [state, setState] = useState<WCState>({ status: "idle" });
  const cancelRef = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const boot = useCallback((files: ReplicationNextFile[]) => {
    cancelActive?.();
    const controller = new AbortController();
    const { signal } = controller;
    const cancel = () => controller.abort();
    cancelActive = cancel;
    cancelRef.current = cancel;
    setState({ status: "booting" });

    // Serialize mounts so an obsolete attempt cannot overwrite the next preview.
    const task = setupQueue
      .then(async () => {
        signal.throwIfAborted();
        const scaffold = withScaffold(files);
        const wc = await getWebContainer();
        signal.throwIfAborted();
        if (runningProcess) {
          runningProcess.kill();
          await runningProcess.exit;
          runningProcess = null;
        }
        signal.throwIfAborted();
        for (const entry of await wc.fs.readdir(".")) {
          await wc.fs.rm(entry, { recursive: true, force: true });
        }
        signal.throwIfAborted();
        const snapshot = await fetchBaseSnapshot(signal);
        signal.throwIfAborted();
        let mounted = false;
        if (snapshot) {
          try {
            await wc.mount(snapshot);
            await wc.fs.readFile("node_modules/.bin/next", "utf-8");
            await wc.fs.readFile("node_modules/next/dist/bin/next", "utf-8");
            const installed = JSON.parse(
              await wc.fs.readFile("package.json", "utf-8"),
            );
            const expected = JSON.parse(
              scaffold.find((file) => file.path === "package.json")!.content,
            );
            if (
              JSON.stringify(installed.dependencies) !==
                JSON.stringify(expected.dependencies) ||
              JSON.stringify(installed.devDependencies) !==
                JSON.stringify(expected.devDependencies)
            ) {
              throw new Error(
                "Snapshot dependencies do not match the preview scaffold",
              );
            }
            mounted = true;
          } catch {
            signal.throwIfAborted();
            for (const entry of await wc.fs.readdir(".")) {
              await wc.fs.rm(entry, { recursive: true, force: true });
            }
          }
        }
        signal.throwIfAborted();
        await wc.mount(buildFsTree(scaffold));
        signal.throwIfAborted();
        if (!mounted) {
          setState({ status: "installing" });
          await runCommand(
            wc,
            [
              "install",
              "--include=dev",
              "--legacy-peer-deps",
              "--no-audit",
              "--no-fund",
            ],
            signal,
            300_000,
          );
        }
        signal.throwIfAborted();
        setState({ status: "starting" });

        await new Promise<void>((resolve, reject) => {
          let proc: WebContainerProcess | null = null;
          let stopped = false;
          let log = () => "";
          const cleanup = () => {
            clearTimeout(timer);
            offReady();
          };
          const abort = () => {
            stopped = true;
            cleanup();
            proc?.kill();
            reject(new DOMException("Preview stopped", "AbortError"));
          };
          const fail = (error: Error) => {
            if (stopped) return;
            stopped = true;
            cleanup();
            signal.removeEventListener("abort", abort);
            proc?.kill();
            if (!signal.aborted)
              setState({ status: "error", message: error.message });
            reject(error);
          };
          const timer = setTimeout(
            () => fail(new Error(`Dev server didn't start in time.\n${log()}`)),
            120_000,
          );
          const offReady = wc.on("server-ready", (_port, url) => {
            cleanup();
            if (!signal.aborted) setState({ status: "ready", url });
            resolve();
          });
          signal.addEventListener("abort", abort, { once: true });
          void wc
            .spawn("npm", ["run", "dev"])
            .then(async (started) => {
              proc = started;
              runningProcess = proc;
              const output = captureOutput(proc);
              log = output.text;
              if (signal.aborted || stopped) {
                proc.kill();
                return;
              }
              const code = await proc.exit;
              await output.done;
              if (!signal.aborted)
                fail(
                  new Error(
                    `Next.js dev server exited (code ${code}).\n${log()}`,
                  ),
                );
            })
            .catch((error: unknown) =>
              fail(error instanceof Error ? error : new Error(String(error))),
            );
        });
      })
      .catch((error: unknown) => {
        if (!signal.aborted)
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "WebContainer failed to start",
          });
      });
    setupQueue = task;
    return task;
  }, []);

  return { state, boot, stop };
}
