export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
export async function requestJson(
  url: string,
  init: RequestInit,
  retries = 5,
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
        );
      return await response.json();
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) throw error;
      if (attempt >= retries) throw error;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(8000, 250 * 2 ** attempt) + Math.random() * 250,
        ),
      );
    }
  }
}
