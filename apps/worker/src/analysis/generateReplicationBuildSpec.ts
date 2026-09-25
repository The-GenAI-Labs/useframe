import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { env } from "../config/env.js"
import type { AssetManifest } from "../scraper/collectNetworkAssets.js"
import type { DenseFrame } from "../scraper/captureDenseFrames.js"
import type { WheelFrame } from "../scraper/captureWheelScroll.js"
import type { PageRecon } from "../scraper/detectPinnedSections.js"

export type ReplicationCapture = {
  fullPageShot: Buffer
  denseFrames: DenseFrame[]
  wheelFrames: WheelFrame[]
  assetManifest: AssetManifest
  cleanedHtml: string
  designTokens: unknown
  recon: PageRecon
}

const SYSTEM_PROMPT = `You will be shown screenshots, scroll frames, video-transition frames, and
a list of real network assets (images/video/font URLs) from a permitted
website. Write a complete build specification for a developer to follow.
Rules: use EXACT hex codes from computed styles, never color names. Use the
REAL asset URLs given, never invent placeholders. Use EXACT pixel values
for spacing/sizing from bounding boxes. List sections in the exact order
seen. Only describe in words what can't be a number: animation feel, pinned
scroll behavior, overall mood. Output one detailed spec, nothing else.`

const deepseekProvider = createOpenAI({
  apiKey: env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1",
})

const anthropicProvider = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" })

export function isReplicationModelAvailable(tier: "free" | "paid"): boolean {
  return tier === "free" ? !!env.DEEPSEEK_API_KEY : !!env.ANTHROPIC_API_KEY
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

function isValidPng(buf: Buffer): boolean {
  return buf.length > PNG_SIGNATURE.length && buf.subarray(0, 8).equals(PNG_SIGNATURE) && buf.length <= MAX_IMAGE_BYTES
}

export async function generateReplicationBuildSpec(
  capture: ReplicationCapture,
  sourceUrl: string,
  tier: "free" | "paid",
): Promise<string> {
  const model = tier === "free" ? deepseekProvider("deepseek-flash") : anthropicProvider("claude-sonnet-4-6")

  const pinnedFrames = capture.denseFrames.filter((f) =>
    capture.recon.pinnedRanges.some((r) => f.scrollY >= r.startY && f.scrollY <= r.endY),
  )
  const otherFrames = capture.denseFrames.filter((f) => !pinnedFrames.includes(f))
  const frameBudget = tier === "free" ? { other: 6, wheel: 4 } : { other: 12, wheel: 8 }

  const images = [
    capture.fullPageShot,
    ...pinnedFrames.map((f) => f.image),
    ...otherFrames.slice(0, frameBudget.other).map((f) => f.image),
    ...capture.wheelFrames.slice(0, frameBudget.wheel).map((f) => f.image),
  ].filter(isValidPng)

  const textContext = [
    `Source URL: ${sourceUrl}`,
    `Scroll library detected: ${capture.recon.scrollLibrary ?? "none"}.`,
    `Virtualized content: ${capture.recon.usesVirtualization}.`,
    `Pinned/sticky sections detected: ${capture.recon.pinnedRanges.length}.`,
    `Network assets (real URLs, use exactly these): ${JSON.stringify(capture.assetManifest).slice(0, 4000)}`,
    `Computed style tokens: ${JSON.stringify(capture.designTokens).slice(0, 2000)}`,
    `Cleaned HTML (structure reference): ${capture.cleanedHtml.slice(0, 8000)}`,
  ].join("\n\n")

  const runWithImages = (imgs: Buffer[]) =>
    generateText({
      model,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imgs.map((img) => ({ type: "image" as const, image: img })),
            { type: "text" as const, text: textContext },
          ],
        },
      ],
      experimental_telemetry: { isEnabled: true, functionId: "replication-build-spec" },
    })

  try {
    const { text } = await runWithImages(images)
    return text
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.toLowerCase().includes("image")) throw err
    const { text } = await runWithImages(isValidPng(capture.fullPageShot) ? [capture.fullPageShot] : [])
    return text
  }
}
