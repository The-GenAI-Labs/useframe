import { withRetry } from "@/lib/retry.js";
import {
  ProviderError,
  type CustomHostnameProvider,
  type CustomHostnameState,
} from "./provider.js";

const API = "https://api.cloudflare.com/client/v4";

// HTTP DCV: once the customer's CNAME reaches our zone, Cloudflare answers the CA's
// challenge itself. Switching validation method is a change to this object only.
export const SSL_CONFIG = {
  method: "http",
  type: "dv",
  bundle_method: "ubiquitous",
  wildcard: false,
  settings: { min_tls_version: "1.2", http2: "on", tls_1_3: "on" },
} as const;

const BLOCKED = new Set(["blocked", "pending_blocked", "test_blocked"]);
const STALE_HOSTNAME = new Set(["moved", "broken", "test_failed"]);
const STALE_SSL = new Set([
  "initializing_timed_out",
  "validation_timed_out",
  "issuance_timed_out",
  "deployment_timed_out",
  "inactive",
  "expired",
]);

const CODE_DUPLICATE = 1406;
const CODE_QUOTA = 1405;

type Envelope<T> = {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: T;
  result_info?: { total_count?: number };
};

type RawHostname = {
  id: string;
  hostname: string;
  status: string;
  verification_errors?: string[];
  ssl?: {
    status?: string;
    validation_errors?: { message: string }[];
    expires_on?: string;
    certificates?: { issued_on?: string; expires_on?: string }[];
  };
};

const date = (v: string | undefined) => (v ? new Date(v) : null);

export function toState(raw: RawHostname): CustomHostnameState {
  const cert = raw.ssl?.certificates?.[0];
  return {
    id: raw.id,
    hostname: raw.hostname,
    status: raw.status,
    sslStatus: raw.ssl?.status ?? null,
    verificationErrors: raw.verification_errors ?? [],
    validationErrors: (raw.ssl?.validation_errors ?? []).map((e) => e.message),
    certIssuedAt: date(cert?.issued_on),
    certExpiresAt: date(cert?.expires_on ?? raw.ssl?.expires_on),
  };
}

export type CloudflareProviderOptions = {
  zoneId: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
  attempts?: number;
  baseDelayMs?: number;
};

export class CloudflareCustomHostnameProvider implements CustomHostnameProvider {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: CloudflareProviderOptions) {
    this.base = `${API}/zones/${options.zoneId}/custom_hostnames`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
    return withRetry(
      async () => {
        const res = await this.fetchImpl(`${this.base}${path}`, {
          ...init,
          signal: AbortSignal.timeout(10_000),
          headers: {
            authorization: `Bearer ${this.options.apiToken}`,
            "content-type": "application/json",
            ...init.headers,
          },
        });
        const body = (await res.json().catch(() => null)) as Envelope<T> | null;
        if (res.ok && body?.success) return body;

        const codes = body?.errors?.map((e) => e.code) ?? [];
        const detail = body?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
        if (res.status === 404) throw new ProviderError("not_found", detail, 404);
        if (codes.includes(CODE_DUPLICATE) || res.status === 409) {
          throw new ProviderError("duplicate", detail, res.status);
        }
        if (codes.includes(CODE_QUOTA)) throw new ProviderError("quota", detail, res.status);
        if (res.status === 429 || res.status >= 500) throw new ProviderError("transient", detail, res.status);
        if (res.status === 400 || res.status === 422) throw new ProviderError("invalid", detail, res.status);
        throw new ProviderError("unknown", detail, res.status);
      },
      {
        attempts: this.options.attempts ?? 5,
        baseDelayMs: this.options.baseDelayMs ?? 500,
        shouldRetry: (err) =>
          (err instanceof ProviderError && err.kind === "transient") ||
          (err instanceof Error && (err.name === "TimeoutError" || err.name === "TypeError")),
      },
    );
  }

  async create(hostname: string): Promise<CustomHostnameState> {
    const created = await this.request<RawHostname>("", {
      method: "POST",
      body: JSON.stringify({ hostname, ssl: SSL_CONFIG }),
    });
    // The POST response can omit validation details; the GET is authoritative.
    const fresh = await this.get(created.result!.id);
    return fresh ?? toState(created.result!);
  }

  async findByHostname(hostname: string): Promise<CustomHostnameState | null> {
    const params = new URLSearchParams({ hostname, per_page: "50" });
    const body = await this.request<RawHostname[]>(`?${params}`);
    const match = (body.result ?? []).find((h) => h.hostname === hostname);
    return match ? toState(match) : null;
  }

  async get(id: string): Promise<CustomHostnameState | null> {
    try {
      const body = await this.request<RawHostname>(`/${encodeURIComponent(id)}`);
      return toState(body.result!);
    } catch (err) {
      if (err instanceof ProviderError && err.kind === "not_found") return null;
      throw err;
    }
  }

  async revalidate(id: string): Promise<CustomHostnameState> {
    const body = await this.request<RawHostname>(`/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ ssl: SSL_CONFIG }),
    });
    return toState(body.result!);
  }

  async delete(id: string): Promise<void> {
    try {
      await this.request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (err) {
      if (!(err instanceof ProviderError && err.kind === "not_found")) throw err;
    }
  }

  async count(): Promise<number> {
    const body = await this.request<RawHostname[]>(`?per_page=5`);
    return body.result_info?.total_count ?? body.result?.length ?? 0;
  }

  async fallbackOrigin(): Promise<{ origin: string | null; status: string | null }> {
    try {
      const body = await this.request<{ origin?: string; status?: string }>("/fallback_origin");
      return { origin: body.result?.origin ?? null, status: body.result?.status ?? null };
    } catch (err) {
      if (err instanceof ProviderError && err.kind === "not_found") return { origin: null, status: null };
      throw err;
    }
  }

  isLive(state: CustomHostnameState): boolean {
    return state.status === "active" && state.sslStatus === "active";
  }

  isBlocked(state: CustomHostnameState): boolean {
    return BLOCKED.has(state.status);
  }

  needsRevalidation(state: CustomHostnameState): boolean {
    return STALE_HOSTNAME.has(state.status) || (state.sslStatus !== null && STALE_SSL.has(state.sslStatus));
  }
}
