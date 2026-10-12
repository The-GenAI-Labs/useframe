import { classifyStatus, ProviderError, withProviderRetry, type ImageProvider, type ImageResult } from "./types.js"

type Usage = {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { text_tokens?: number; image_tokens?: number }
}

// USD per million tokens for the GPT Image 2.5 family (standard processing).
export const GPT_IMAGE_PRICES = { textInput: 5, imageInput: 8, imageOutput: 30 }

export function costFromUsage(usage: Usage | undefined): number | undefined {
  if (!usage?.output_tokens) return undefined
  const text = usage.input_tokens_details?.text_tokens ?? usage.input_tokens ?? 0
  const image = usage.input_tokens_details?.image_tokens ?? 0
  const usd = (text * GPT_IMAGE_PRICES.textInput + image * GPT_IMAGE_PRICES.imageInput + usage.output_tokens * GPT_IMAGE_PRICES.imageOutput) / 1e6
  return Math.round(usd * 10000) / 10000
}

export type OpenAiImageConfig = {
  apiKey: string
  model: string
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export class OpenAiImageProvider implements ImageProvider {
  private readonly baseUrl: string
  private readonly doFetch: typeof fetch

  constructor(private readonly config: OpenAiImageConfig) {
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")
    this.doFetch = config.fetchImpl ?? fetch
  }

  private async send(path: string, body: BodyInit, json: boolean): Promise<ImageResult> {
    let res: Response
    try {
      res = await this.doFetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, ...(json ? { "Content-Type": "application/json" } : {}) },
        body,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 120_000),
      })
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") throw new ProviderError("TIMEOUT", "OpenAI image request timed out")
      throw err
    }
    const payload = (await res.json().catch(() => null)) as {
      data?: { b64_json?: string }[]
      usage?: Usage
      error?: { message?: string; code?: string }
    } | null
    if (!res.ok) {
      throw classifyStatus(res.status, `OpenAI ${res.status}: ${payload?.error?.message ?? res.statusText}`, payload?.error?.code)
    }
    const b64 = payload?.data?.[0]?.b64_json
    if (!b64) throw new ProviderError("FAILED", "OpenAI returned no image data")
    return { bytes: Buffer.from(b64, "base64"), costUsd: costFromUsage(payload?.usage), model: this.config.model }
  }

  generate(req: Parameters<ImageProvider["generate"]>[0]): Promise<ImageResult> {
    const body = JSON.stringify({
      model: this.config.model,
      prompt: req.prompt,
      size: req.size,
      quality: req.quality,
      output_format: req.format,
      n: 1,
    })
    return withProviderRetry(() => this.send("/images/generations", body, true))
  }

  edit(req: Parameters<ImageProvider["edit"]>[0]): Promise<ImageResult> {
    return withProviderRetry(() => {
      const form = new FormData()
      form.set("model", this.config.model)
      form.set("prompt", req.prompt)
      form.set("size", req.size)
      form.set("quality", req.quality)
      form.set("output_format", req.format)
      req.images.forEach((img, i) => form.append("image[]", new Blob([new Uint8Array(img)], { type: "image/png" }), `input-${i}.png`))
      return this.send("/images/edits", form, false)
    })
  }
}
