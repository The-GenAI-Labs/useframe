export type ProbeResponse = { status: number; headers: Record<string, string>; body: string };

export interface HttpsProber {
  /** null on network/TLS failure. Never follows redirects. */
  get(url: string, timeoutMs: number): Promise<ProbeResponse | null>;
}

export const fetchProber: HttpsProber = {
  async get(url, timeoutMs) {
    try {
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "cache-control": "no-cache" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = (await res.text()).slice(0, 1024);
      return { status: res.status, headers: Object.fromEntries(res.headers), body };
    } catch {
      return null;
    }
  },
};

export type DomainProbe = { healthOk: boolean; deploymentOk: boolean; ok: boolean };

// Failures are expected while DNS and certificates propagate; callers must not log them as errors.
export async function probeDomain(
  prober: HttpsProber,
  hostname: string,
  activeDeploymentId: string | null,
): Promise<DomainProbe> {
  const health = await prober.get(`https://${hostname}/__useframe/health`, 5000);
  const healthOk = health?.status === 200 && health.body.trim() === "useframe-ok";
  if (!healthOk) return { healthOk, deploymentOk: false, ok: false };
  if (!activeDeploymentId) return { healthOk, deploymentOk: true, ok: true };

  const home = await prober.get(`https://${hostname}/`, 10_000);
  const deploymentOk = home?.status === 200 && home.headers["x-useframe-deployment"] === activeDeploymentId;
  return { healthOk, deploymentOk, ok: deploymentOk };
}
