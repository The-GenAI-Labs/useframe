import { sleep as defaultSleep } from "@/lib/retry.js";

export type ProbeResult = { ok: boolean; attempts: number; elapsedMs: number; lastStatus: number | null };

export type ProbeOptions = {
  url: string;
  deploymentId: string;
  timeoutMs: number;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

// Early attempts seeing the previous deployment or a 404 are normal: KV is
// eventually consistent and caches misses, so they are not errors.
export async function probeDeployment(options: ProbeOptions): Promise<ProbeResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const wait = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const started = now();
  let attempts = 0;
  let lastStatus: number | null = null;

  while (true) {
    attempts++;
    try {
      const res = await fetchImpl(options.url, {
        redirect: "manual",
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(10_000),
      });
      lastStatus = res.status;
      await res.body?.cancel();
      if (res.status === 200 && res.headers.get("x-useframe-deployment") === options.deploymentId) {
        return { ok: true, attempts, elapsedMs: now() - started, lastStatus };
      }
    } catch {
      lastStatus = null;
    }
    if (now() - started >= options.timeoutMs) {
      return { ok: false, attempts, elapsedMs: now() - started, lastStatus };
    }
    await wait(options.intervalMs ?? 3000);
  }
}
