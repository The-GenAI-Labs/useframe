import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import sharp, { type Sharp } from "sharp"
import type { MediaVariantRole } from "@repo/schemas"
import { MediaRejectedError } from "./errors.js"
import type { ProcessedMedia, ProducedVariant } from "./types.js"

const WEBP_QUALITY = 80
const WIDTHS: [MediaVariantRole, number][] = [
  ["w480", 480],
  ["w960", 960],
  ["w1600", 1600],
]
const LQIP_MAX_BYTES = 1536
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "heif"])

export type ImageLimits = { maxInputPixels: number }

async function fileVariant(role: MediaVariantRole, file: string, mime: string): Promise<ProducedVariant> {
  const [meta, info, data] = await Promise.all([sharp(file).metadata(), stat(file), readFile(file)])
  return {
    role,
    path: file,
    mime,
    width: meta.width,
    height: meta.height,
    bytes: info.size,
    sha256: createHash("sha256").update(data).digest("hex"),
  }
}

export async function imageExtras(base: Sharp): Promise<{ dominantColor: string | null; lqip: string | null }> {
  const { dominant } = await base.clone().stats()
  const hex = (n: number) => n.toString(16).padStart(2, "0")
  const dominantColor = `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`
  const tiny = await base.clone().resize({ width: 16 }).webp({ quality: 40 }).toBuffer()
  const lqip = `data:image/webp;base64,${tiny.toString("base64")}`
  return { dominantColor, lqip: lqip.length <= LQIP_MAX_BYTES ? lqip : null }
}

// Every served file is a re-encode, which drops EXIF/GPS, ICC and any appended bytes.
export async function processImage(input: string, outDir: string, limits: ImageLimits): Promise<ProcessedMedia> {
  const open = () => sharp(input, { limitInputPixels: limits.maxInputPixels, failOn: "error", sequentialRead: true })

  let meta: sharp.Metadata
  try {
    meta = await open().metadata()
  } catch (err) {
    if (err instanceof Error && /pixel limit/i.test(err.message)) {
      throw new MediaRejectedError("This image is too large to process", "pixel limit")
    }
    throw new MediaRejectedError("Couldn't read this image", "metadata decode failed")
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new MediaRejectedError("Couldn't read this image", `format ${meta.format ?? "unknown"}`)
  }
  if (meta.format === "heif" && meta.compression !== "av1") {
    throw new MediaRejectedError("Please export as JPEG or PNG", "heic")
  }
  if ((meta.pages ?? 1) > 1) throw new MediaRejectedError("Animated images aren't supported", "multi-page")

  let base: Sharp
  let width: number
  let height: number
  try {
    // Full decode up front, so a truncated or corrupt file fails here rather than mid-way.
    const { data, info } = await open().rotate().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true })
    width = info.width
    height = info.height
    base = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
  } catch (err) {
    if (err instanceof Error && /pixel limit/i.test(err.message)) {
      throw new MediaRejectedError("This image is too large to process", "pixel limit")
    }
    throw new MediaRejectedError("Couldn't read this image", "decode failed")
  }

  const variants: ProducedVariant[] = []
  const targets = WIDTHS.filter(([, w]) => w <= width)
  if (targets.length === 0) targets.push(["w480", width])
  if (width >= 2400) targets.push(["w2400", 2400])
  for (const [role, w] of targets) {
    const file = path.join(outDir, `${role}.webp`)
    await base
      .clone()
      .resize({ width: Math.min(w, width), withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toFile(file)
    variants.push(await fileVariant(role, file, "image/webp"))
  }

  const fallback = path.join(outDir, "fallback.jpg")
  await base
    .clone()
    .resize({ width: Math.min(1600, width), withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(fallback)
  variants.push(await fileVariant("fallback", fallback, "image/jpeg"))

  const thumb = path.join(outDir, "thumb.webp")
  await base
    .clone()
    .resize({ width: Math.min(320, width), withoutEnlargement: true })
    .webp({ quality: 70 })
    .toFile(thumb)
  variants.push(await fileVariant("thumb", thumb, "image/webp"))

  const extras = await imageExtras(base)
  const describe = variants.find((v) => v.role === "w960") ?? variants.find((v) => v.role === "w480")
  return { width, height, ...extras, variants, describeImage: describe?.path ?? null, warnings: [] }
}
