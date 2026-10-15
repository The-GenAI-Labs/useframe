import sharp from "sharp"
import type { Prisma } from "@useframe/db"
import {
  deltaE76,
  hexToRgb,
  minDeltaE,
  nearestStandardSize,
  ProviderError,
  requestSizeFor,
  sha256,
  type Rgb,
  type Size,
} from "@repo/media-ai"
import { log } from "@/lib/logger.js"
import type { GenerateDeps } from "./deps.js"

export type Analysis = { paletteDeltaE: number; textZoneLuminance: number; textZoneVariance: number }

// Crops to the target ratio and resizes, so every frame matches the video canvas exactly.
export async function fitToSize(bytes: Buffer, target: Size): Promise<Buffer> {
  return sharp(bytes).resize(target.width, target.height, { fit: "cover", position: "attention" }).png().toBuffer()
}

type ImageCall = {
  prompt: string
  target: Size
  requestKey: string
  edit?: Buffer[]
}

// Asks for the target size (or the smallest valid one above it); a rejected
// size falls back to the nearest standard size, then everything is cropped to the target.
export async function generateImage(deps: GenerateDeps, call: ImageCall): Promise<{ bytes: Buffer; costUsd: number; model: string; size: string }> {
  return deps.semaphores.image.run(async () => {
    const attempt = async (size: Size) => {
      const s = `${size.width}x${size.height}`
      const req = { prompt: call.prompt, size: s, quality: deps.config.imageQuality, format: "png" as const, requestKey: call.requestKey }
      const result = call.edit?.length ? await deps.images.edit({ ...req, images: call.edit }) : await deps.images.generate(req)
      return { ...result, size: s }
    }
    let result
    try {
      result = await attempt(requestSizeFor(call.target))
    } catch (err) {
      if (!(err instanceof ProviderError) || err.kind !== "INVALID_SIZE") throw err
      const fallback = nearestStandardSize(call.target)
      log.warn("image size rejected; using a standard size", { requested: requestSizeFor(call.target), fallback })
      result = await attempt(fallback)
    }
    return { bytes: await fitToSize(result.bytes, call.target), costUsd: result.costUsd ?? deps.config.ai.providerCostUsd.image, model: result.model, size: result.size }
  })
}

// Soft signals only: palette distance of the dominant colours and how calm the headline area is.
export async function analyzeImage(bytes: Buffer, palette: string[], zone: string): Promise<Analysis> {
  const { data, info } = await sharp(bytes).resize(64, 64, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const buckets = new Map<string, { rgb: Rgb; count: number }>()
  for (let i = 0; i < data.length; i += 3) {
    const rgb: Rgb = [data[i]! & 0xe0, data[i + 1]! & 0xe0, data[i + 2]! & 0xe0]
    const key = rgb.join(",")
    const b = buckets.get(key)
    if (b) b.count++
    else buckets.set(key, { rgb, count: 1 })
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 5).map((b) => b.rgb)
  const pal = palette.flatMap((h) => (hexToRgb(h) ? [hexToRgb(h)!] : []))
  const paletteDeltaE = pal.length ? Math.round(Math.min(...dominant.map((c) => minDeltaE(c, pal))) * 10) / 10 : 0

  const third = Math.floor(info.width / 3)
  const [x0, x1] = zone === "right" ? [info.width - third, info.width] : zone === "center" ? [third, 2 * third] : [0, third]
  const lums: number[] = []
  for (let y = 0; y < info.height; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * info.width + x) * 3
      lums.push((0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255)
    }
  }
  const mean = lums.reduce((a, b) => a + b, 0) / lums.length
  const variance = lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length
  return { paletteDeltaE, textZoneLuminance: Math.round(mean * 1000) / 1000, textZoneVariance: Math.round(variance * 10000) / 10000 }
}

// Scrim hint for background slots: needed when the headline area is busy or mid-grey.
export function overlayHint(analysis: Analysis, slotDefault: "none" | "light" | "dark" | undefined): "none" | "light" | "dark" {
  const wanted = slotDefault ?? "dark"
  if (wanted === "none") return "none"
  const busy = analysis.textZoneVariance > 0.02
  if (!busy && wanted === "dark" && analysis.textZoneLuminance < 0.35) return "none"
  if (!busy && wanted === "light" && analysis.textZoneLuminance > 0.7) return "none"
  return wanted
}

export async function waitForAsset(deps: GenerateDeps, assetId: string): Promise<"READY" | "FAILED"> {
  const deadline = Date.now() + deps.config.assetTimeoutMs
  let wait = 1000
  for (;;) {
    const asset = await deps.db.mediaAsset.findUnique({ where: { id: assetId }, select: { status: true } })
    if (asset?.status === "READY" || asset?.status === "FAILED") return asset.status
    if (!asset || Date.now() > deadline) return "FAILED"
    await deps.sleep(wait)
    wait = Math.min(wait * 1.5, 5000)
  }
}

export async function variantBytes(deps: GenerateDeps, assetId: string, role: string): Promise<Buffer | null> {
  const asset = await deps.db.mediaAsset.findUnique({ where: { id: assetId }, select: { variants: true } })
  const variants = (Array.isArray(asset?.variants) ? asset.variants : []) as { role?: string; key?: string }[]
  const key = variants.find((v) => v.role === role)?.key
  return key ? deps.store.getBuffer(key, 200 * 1024 * 1024) : null
}

export async function updateAsset(deps: GenerateDeps, assetId: string, data: Prisma.MediaAssetUpdateInput): Promise<void> {
  await deps.db.mediaAsset.update({ where: { id: assetId }, data })
}

export const promptHash = (prompt: string) => sha256(prompt).slice(0, 12)

export { deltaE76 }
