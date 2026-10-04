const SECOND = 1000;
const MINUTE = 60 * SECOND;

export function ownershipDelay(elapsedMs: number): number {
  if (elapsedMs < 2 * MINUTE) return 15 * SECOND;
  if (elapsedMs < 30 * MINUTE) return MINUTE;
  return 5 * MINUTE;
}

export function routingDelay(elapsedMs: number): number {
  return elapsedMs < 10 * MINUTE ? 30 * SECOND : 10 * MINUTE;
}

export const REVALIDATE_INTERVAL_S = 10 * 60;
export const TEARDOWN_RETRY_MS = 30 * SECOND;
export const ERROR_BACKOFF_MS = MINUTE;
