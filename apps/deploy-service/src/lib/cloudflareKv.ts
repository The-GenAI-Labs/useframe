import { withRetry } from "./retry.js";

const API = "https://api.cloudflare.com/client/v4";
const BULK_LIMIT = 10_000;

export class KvApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "KvApiError";
  }
}

export type KvClientOptions = {
  accountId: string;
  namespaceId: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
  attempts?: number;
  baseDelayMs?: number;
  timeoutMs?: number;
};

type Envelope<T> = {
  success: boolean;
  errors?: { code: number; message: string }[];
  result?: T;
  result_info?: { cursor?: string; count?: number };
};

function isRetryable(err: unknown): boolean {
  if (err instanceof KvApiError) return err.status === 429 || err.status >= 500;
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "TypeError");
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 30_000) : undefined;
}

export class CloudflareKv {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: KvClientOptions) {
    this.base = `${API}/accounts/${options.accountId}/storage/kv/namespaces/${options.namespaceId}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    return withRetry(
      async () => {
        const res = await this.fetchImpl(`${this.base}${path}`, {
          ...init,
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
          headers: { authorization: `Bearer ${this.options.apiToken}`, ...init.headers },
        });
        if (res.status === 404 && (init.method ?? "GET") === "GET" && path.startsWith("/values/")) {
          return res;
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as Envelope<unknown> | null;
          const detail = body?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ");
          throw new KvApiError(
            `KV ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status})${detail ? `: ${detail}` : ""}`,
            res.status,
            parseRetryAfter(res.headers.get("retry-after")),
          );
        }
        return res;
      },
      {
        attempts: this.options.attempts ?? 5,
        baseDelayMs: this.options.baseDelayMs ?? 500,
        shouldRetry: isRetryable,
        retryAfterMs: (err) => (err instanceof KvApiError ? err.retryAfterMs : undefined),
      },
    );
  }

  private valuePath(key: string): string {
    return `/values/${encodeURIComponent(key)}`;
  }

  async put(key: string, value: string): Promise<void> {
    await this.request(this.valuePath(key), {
      method: "PUT",
      body: value,
      headers: { "content-type": "text/plain" },
    });
  }

  async get(key: string): Promise<string | null> {
    const res = await this.request(this.valuePath(key), { method: "GET" });
    if (res.status === 404) return null;
    return res.text();
  }

  async delete(key: string): Promise<void> {
    await this.request(this.valuePath(key), { method: "DELETE" });
  }

  async listKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor: string | undefined;
    do {
      const params = new URLSearchParams({ prefix, limit: "1000" });
      if (cursor) params.set("cursor", cursor);
      const res = await this.request(`/keys?${params}`, { method: "GET" });
      const body = (await res.json()) as Envelope<{ name: string }[]>;
      keys.push(...(body.result ?? []).map((k) => k.name));
      cursor = body.result_info?.cursor || undefined;
    } while (cursor);
    return keys;
  }

  async bulkPut(entries: { key: string; value: string }[]): Promise<void> {
    await this.bulk(entries, (chunk) =>
      this.request("/bulk", {
        method: "PUT",
        body: JSON.stringify(chunk),
        headers: { "content-type": "application/json" },
      }),
      (e) => e.key,
    );
  }

  async bulkDelete(keys: string[]): Promise<void> {
    await this.bulk(keys, (chunk) =>
      this.request("/bulk/delete", {
        method: "POST",
        body: JSON.stringify(chunk),
        headers: { "content-type": "application/json" },
      }),
      (k) => k,
    );
  }

  private async bulk<T>(
    items: T[],
    send: (chunk: T[]) => Promise<Response>,
    keyOf: (item: T) => string,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += BULK_LIMIT) {
      let chunk = items.slice(i, i + BULK_LIMIT);
      for (let attempt = 0; chunk.length > 0; attempt++) {
        const res = await send(chunk);
        const body = (await res.json()) as Envelope<{ unsuccessful_keys?: string[] }>;
        const failed = new Set(body.result?.unsuccessful_keys ?? []);
        if (failed.size === 0) break;
        if (attempt >= 4) throw new KvApiError(`KV bulk left ${failed.size} keys unwritten`, 503);
        chunk = chunk.filter((item) => failed.has(keyOf(item)));
      }
    }
  }
}
