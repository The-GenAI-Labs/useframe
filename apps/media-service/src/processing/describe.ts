import { readFile } from "node:fs/promises"
import { MediaDescribeOutputSchema, type MediaDescribeOutput } from "@repo/schemas"
import { errorMessage, log } from "@/lib/logger.js"

export type DescribeInput = { imagePath: string; tier: "free" | "paid"; assetId: string }

export type Describer = (input: DescribeInput) => Promise<MediaDescribeOutput | null>

// Only pixels and the tier leave this service; never file names, titles or user ids.
export function createOrchestratorDescriber(config: {
  url: string
  secret: string
  timeoutMs: number
  fetchImpl?: typeof fetch
}): Describer {
  const doFetch = config.fetchImpl ?? fetch
  return async ({ imagePath, tier, assetId }) => {
    const image = (await readFile(imagePath)).toString("base64")
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await doFetch(`${config.url.replace(/\/$/, "")}/internal/media/describe`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-internal-secret": config.secret },
          body: JSON.stringify({ image, mime: "image/webp", tier }),
          signal: AbortSignal.timeout(config.timeoutMs),
        })
        const body = (await res.json().catch(() => null)) as { success?: boolean; data?: unknown } | null
        const parsed = MediaDescribeOutputSchema.safeParse(body?.data)
        if (res.ok && parsed.success) return parsed.data
        log.warn("media describe returned an unusable response", { assetId, attempt, status: res.status })
        if (res.status >= 400 && res.status < 500 && res.status !== 422) return null
      } catch (err) {
        log.warn("media describe failed", { assetId, attempt, error: errorMessage(err) })
      }
    }
    return null
  }
}
