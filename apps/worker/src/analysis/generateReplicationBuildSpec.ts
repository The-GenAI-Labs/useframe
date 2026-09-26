import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { env } from "../config/env.js"
import type { AssetManifest } from "../scraper/collectNetworkAssets.js"
import type { DenseFrame } from "../scraper/captureDenseFrames.js"
import type { WheelFrame } from "../scraper/captureWheelScroll.js"
import type { PageRecon } from "../scraper/detectPinnedSections.js"
import type { PositionedAsset, IconFontUsage } from "../scraper/extractAssetPositions.js"
import type { PreciseStyling, NoiseTexture } from "../scraper/extractDesignTokens.js"

export type ReplicationCapture = {
  fullPageShot: Buffer
  denseFrames: DenseFrame[]
  wheelFrames: WheelFrame[]
  assetManifest: AssetManifest
  cleanedHtml: string
  designTokens: unknown
  recon: PageRecon
  positionedAssets: PositionedAsset[]
  iconFonts: IconFontUsage[]
  sectionStyling: Record<string, PreciseStyling>
  noiseTexture: NoiseTexture
  dualMode: { light: PreciseStyling; dark: PreciseStyling } | null
}

const SYSTEM_PROMPT = `You will be shown screenshots, scroll frames, video-transition frames, and
a list of real network assets (images/video/font URLs) from a permitted
website. Write a complete build specification for a developer to follow.
Rules: use EXACT hex codes from computed styles, never color names. Use the
REAL asset URLs given, never invent placeholders. Use EXACT pixel values
for spacing/sizing from bounding boxes. List sections in the exact order
seen. Only describe in words what can't be a number: animation feel, pinned
scroll behavior, overall mood.

Every asset given is mapped to its exact section and position - place it
there, don't just list it. Use the REAL asset URLs directly in the generated
code (hotlinked, not re-uploaded); never invent placeholder URLs.

For every colour, ALWAYS use the exact computed value given (including full
gradient strings, box-shadow, backdrop-filter) - never approximate a
gradient as a flat colour. If dual-mode data is present, produce distinct
light and dark token sets, not one set applied to both. If a noise/grain
texture is present, note its exact implementation (data-URI overlay vs SVG
filter) so the developer can reproduce the same technique, not just "a
grainy look." Icon-font glyphs cannot be reproduced exactly - note the
font-family and character, and approximate with a similar inline icon.
Sprite-sheet icons are flagged only, not pixel-cropped - approximate with a
standalone icon.

Output one detailed spec, nothing else.`

const deepseekProvider = createOpenAI({
  apiKey: env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1",
})

const anthropicProvider = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" })

export function isReplicationModelAvailable(tier: "free" | "paid"): boolean {
  return tier === "free" ? !!env.DEEPSEEK_API_KEY : !!env.ANTHROPIC_API_KEY
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44])
const MAX_IMAGE_BYTES = 4 * 1024 * 1024

// Signature + size alone pass a PNG that Playwright's full-page screenshot
// truncated mid-capture (seen on canvas/WebGL-heavy pages) - the file starts
// correctly but is missing its IEND terminator chunk, which Anthropic's
// image decoder then rejects as "unsupported image" while our own check
// stayed green. Checking for IEND in the tail catches that class of
// corruption without pulling in an image-decoding dependency.
function isValidPng(buf: Buffer): boolean {
  return (
    buf.length > PNG_SIGNATURE.length &&
    buf.subarray(0, 8).equals(PNG_SIGNATURE) &&
    buf.length <= MAX_IMAGE_BYTES &&
    buf.subarray(-12, -8).equals(PNG_IEND)
  )
}

// @ai-sdk/openai's chat-completions class always reads reasoning_effort from
// providerOptions.openai regardless of the provider instance's own name, so
// this key is correct even though the model itself is DeepSeek, not OpenAI.
const DEEPSEEK_HIGH_REASONING_OPTIONS = { openai: { reasoningEffort: "high" } } as const

export async function generateReplicationBuildSpec(
  capture: ReplicationCapture,
  sourceUrl: string,
  tier: "free" | "paid",
): Promise<string> {
  const model = tier === "free" ? deepseekProvider("deepseek-flash") : anthropicProvider("claude-sonnet-4-6")
  const providerOptions = tier === "free" ? DEEPSEEK_HIGH_REASONING_OPTIONS : undefined

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
    `Assets mapped to exact section and position (use these positions, not the flat list above): ${JSON.stringify(capture.positionedAssets).slice(0, 6000)}`,
    `Icon fonts in use (font-family + glyph, approximate visually): ${JSON.stringify(capture.iconFonts).slice(0, 1000)}`,
    `Computed style tokens: ${JSON.stringify(capture.designTokens).slice(0, 2000)}`,
    `Precise per-section styling (exact gradients/shadows/blur, never approximate): ${JSON.stringify(capture.sectionStyling).slice(0, 3000)}`,
    `Noise/grain texture: ${JSON.stringify(capture.noiseTexture)}`,
    `Dual colour mode: ${capture.dualMode ? JSON.stringify(capture.dualMode).slice(0, 2000) : "none detected - site has no dark mode, produce a single token set"}`,
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
      providerOptions,
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
