export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}
export const MAX_ATTEMPTS = 6;
const MAX_DELAY_MS = 60_000;

export function retryAfterMs(header: string | null, now = Date.now()) {
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - now;
  return Number.isFinite(ms) && ms >= 0
    ? Math.min(ms, MAX_DELAY_MS)
    : undefined;
}
export function backoffMs(attempt: number, random = Math.random()) {
  const ceiling = Math.min(MAX_DELAY_MS, 1000 * 2 ** attempt);
  return ceiling / 2 + (random * ceiling) / 2;
}
export async function requestJson(
  url: string,
  init: RequestInit,
  attempts = MAX_ATTEMPTS,
): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new ProviderError(
          `Provider returned HTTP ${response.status}`,
          response.status === 429 || response.status >= 500,
          response.status === 429
            ? retryAfterMs(response.headers.get("retry-after"))
            : undefined,
        );
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) throw error;
      if (attempt + 1 >= attempts) throw error;
      const delay =
        (error instanceof ProviderError ? error.retryAfterMs : undefined) ??
        backoffMs(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
