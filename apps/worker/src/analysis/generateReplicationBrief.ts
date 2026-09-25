import { generateObject } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { z } from "zod"
import { env } from "../config/env.js"
import type { AssetManifest } from "../scraper/collectNetworkAssets.js"
import type { DenseFrame } from "../scraper/captureDenseFrames.js"
import type { WheelFrame } from "../scraper/captureWheelScroll.js"
import type { PageRecon } from "../scraper/detectPinnedSections.js"

const ReplicationBriefSchema = z.object({
  product: z.string(),
  audience: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
  }),
  goal: z.string(),
  brand: z.object({
    personality: z.string(),
    positioning: z.string(),
    tone: z.string(),
  }),
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    rationale: z.string(),
    citation: z.string(),
  }),
  typography: z.object({
    primary: z.string(),
    secondary: z.string(),
    minSize: z.string(),
    rationale: z.string(),
    citation: z.string(),
  }),
  layout: z.object({
    sections: z.array(z.string()),
    rationale: z.string(),
    citation: z.string(),
  }),
  copyFramework: z.enum(["AIDA", "PAS", "FAB", "PASTOR"]),
  frameworkRationale: z.string(),
  density: z.string(),
  motion: z.string(),
  accessibility: z.object({
    minContrast: z.string(),
    touchTarget: z.string(),
  }),
  avoid: z.array(z.string()),
})

export type ReplicationBrief = z.infer<typeof ReplicationBriefSchema>

export type ReplicationCapture = {
  fullPageShot: Buffer
  denseFrames: DenseFrame[]
  wheelFrames: WheelFrame[]
  assetManifest: AssetManifest
  cleanedHtml: string
  designTokens: unknown
  recon: PageRecon
}

const SYSTEM_PROMPT = `You are reconstructing an EXACT replica of the website at the provided source URL.

You have: a full-page screenshot, dense scroll-position frames (denser around any
sticky/pinned sections), wheel-scroll frames captured with real scroll deltas,
the real network asset URLs, cleaned HTML/DOM, and computed style tokens.

Reproduce the layout, copy, structure, colors, typography, spacing, and
scroll-linked motion as closely as the evidence allows. Reference the real
asset URLs when describing images used - never invent substitutes.

Output a design brief in the exact same shape used for research-backed
generation. This is a reconstruction of observed reality, not a researched
recommendation, so keep rationale fields short and descriptive of what was
observed rather than persuasive reasoning.`

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

export async function generateReplicationBrief(
  capture: ReplicationCapture,
  sourceUrl: string,
  tier: "free" | "paid",
): Promise<ReplicationBrief> {
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
    `Reconstruct a design brief for ${sourceUrl}.`,
    `Scroll library detected: ${capture.recon.scrollLibrary ?? "none"}.`,
    `Virtualized content: ${capture.recon.usesVirtualization}.`,
    `Pinned/sticky sections detected: ${capture.recon.pinnedRanges.length}.`,
    `Network assets (use these real URLs, do not invent): ${JSON.stringify(capture.assetManifest).slice(0, 4000)}`,
    `Computed style tokens: ${JSON.stringify(capture.designTokens).slice(0, 2000)}`,
    `Cleaned HTML (structure reference): ${capture.cleanedHtml.slice(0, 8000)}`,
  ].join("\n\n")

  const runWithImages = (imgs: Buffer[]) =>
    generateObject({
      model,
      schema: ReplicationBriefSchema,
      // DeepSeek thinking mode rejects the forced tool_choice "tool" mode uses.
      ...(tier === "free" ? { mode: "json" as const } : {}),
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
      experimental_telemetry: { isEnabled: true, functionId: "replication-brief" },
    })

  try {
    const { object } = await runWithImages(images)
    return object
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.toLowerCase().includes("image")) throw err
    const { object } = await runWithImages(isValidPng(capture.fullPageShot) ? [capture.fullPageShot] : [])
    return object
  }
}
