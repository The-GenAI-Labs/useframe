export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  shouldRetry: (err: unknown) => boolean;
  retryAfterMs?: (err: unknown) => number | undefined;
  sleep?: (ms: number) => Promise<void>;
};

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function jitteredDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const wait = options.sleep ?? sleep;
  const maxDelay = options.maxDelayMs ?? 30_000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt + 1 >= options.attempts || !options.shouldRetry(err)) throw err;
      const hinted = options.retryAfterMs?.(err);
      await wait(hinted ?? jitteredDelay(attempt, options.baseDelayMs, maxDelay));
    }
  }
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
