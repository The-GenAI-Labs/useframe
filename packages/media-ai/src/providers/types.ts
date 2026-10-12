export type ImageResult = { bytes: Buffer; costUsd?: number; model: string }

export interface ImageProvider {
  generate(req: { prompt: string; size: string; quality: string; format: "png" | "webp"; requestKey: string }): Promise<ImageResult>
  edit(req: {
    prompt: string
    images: Buffer[]
    size: string
    quality: string
    format: "png" | "webp"
    requestKey: string
  }): Promise<ImageResult>
}

export type VideoPollResult = {
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "REFUSED"
  outputs?: { url?: string; delivered?: boolean }[]
  costUsd?: number
  error?: string
}

export interface VideoProvider {
  readonly name: string
  readonly model: string
  submit(req: {
    prompt: string
    firstFrame: Buffer
    lastFrame?: Buffer
    durationSec: number
    resolution: "480p" | "768p"
    results: number
    promptExpansion: "disabled" | "balanced" | "quality"
    seed?: number
    deliverTo?: { presignedPutUrl: string }
    requestKey: string
    // A task id stored before a crash; the adapter reuses it instead of minting one.
    taskId?: string
  }): Promise<{ taskId: string }>
  poll(taskId: string): Promise<VideoPollResult>
  // The task id a submit with this request key will use (stored before submitting).
  taskIdFor(requestKey: string): string
}

export type ProviderErrorKind = "REFUSED" | "TRANSIENT" | "INVALID_SIZE" | "TIMEOUT" | "FAILED"

// Carries the provider's own message so a parameter mismatch is easy to spot.
export class ProviderError extends Error {
  constructor(
    public readonly kind: ProviderErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = "ProviderError"
  }
}

export function classifyStatus(status: number, message: string, code?: string): ProviderError {
  const policy = /moderation|content.?policy|safety|blocked|nsfw/i
  if ((code && policy.test(code)) || policy.test(message)) return new ProviderError("REFUSED", message, status)
  if (status === 429 || status >= 500) return new ProviderError("TRANSIENT", message, status)
  if (/size/i.test(code ?? "") || /\bsize\b/i.test(message)) return new ProviderError("INVALID_SIZE", message, status)
  return new ProviderError("FAILED", message, status)
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// 429/5xx and network failures: exponential backoff with jitter, at most 3 attempts.
export async function withProviderRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 1000, wait = sleep): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const transient =
        (err instanceof ProviderError && err.kind === "TRANSIENT") ||
        (err instanceof TypeError && /fetch failed/i.test(err.message))
      if (!transient || attempt >= attempts) throw err
      const exp = baseMs * 2 ** (attempt - 1)
      await wait(exp / 2 + Math.random() * (exp / 2))
    }
  }
}
