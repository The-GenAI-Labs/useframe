import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"
import { z } from "zod"
import type { MediaVariantRole } from "@repo/schemas"
import { MediaRejectedError } from "./errors.js"
import { ffmpeg, FfmpegError, ffprobe, INPUT_GUARD, type FfmpegConfig } from "./ffmpeg.js"
import { imageExtras } from "./image.js"
import type { ProcessedMedia, ProducedVariant } from "./types.js"

const ALLOWED_CONTAINERS = new Set(["mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"])
const MAX_DIMENSION = 3840
const LIGHT_VIDEO_BYTES = 8 * 1024 * 1024

export type VideoOptions = { maxSeconds: number; stripAudio: boolean }

const ProbeSchema = z.object({
  format: z.object({
    format_name: z.string(),
    duration: z.string().optional(),
    filename: z.string().optional(),
  }),
  streams: z.array(
    z.object({
      codec_type: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
      disposition: z.object({ attached_pic: z.number().optional() }).partial().optional(),
      side_data_list: z.array(z.object({ rotation: z.number().optional() }).passthrough()).optional(),
    }),
  ),
})

export type VideoProbe = { width: number; height: number; durationMs: number; hasAudio: boolean }

export function checkProbe(raw: unknown, input: string, maxSeconds: number): VideoProbe {
  const parsed = ProbeSchema.safeParse(raw)
  if (!parsed.success) throw new MediaRejectedError("Couldn't read this video", "unparseable probe")
  const { format, streams } = parsed.data
  if (!ALLOWED_CONTAINERS.has(format.format_name)) {
    throw new MediaRejectedError("Use an MP4, MOV or WebM video", `container ${format.format_name}`)
  }
  if (format.filename && path.resolve(format.filename) !== path.resolve(input)) {
    throw new MediaRejectedError("Couldn't read this video", "probe referenced another input")
  }
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic)
  if (!video?.width || !video.height) throw new MediaRejectedError("This file has no video track", "no video stream")
  const durationMs = Math.round(Number(format.duration ?? "0") * 1000)
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new MediaRejectedError("Couldn't read this video", "unknown duration")
  }
  if (durationMs > maxSeconds * 1000) {
    throw new MediaRejectedError(`Videos can be up to ${maxSeconds} seconds long`, `duration ${durationMs}ms`)
  }
  if (Math.max(video.width, video.height) > MAX_DIMENSION) {
    throw new MediaRejectedError("Videos can be up to 4K (3840 px)", `${video.width}x${video.height}`)
  }
  const rotation = Math.abs(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0) % 180
  const [width, height] = rotation === 90 ? [video.height, video.width] : [video.width, video.height]
  return { width, height, durationMs, hasAudio: streams.some((s) => s.codec_type === "audio") }
}

const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2)

async function fileVariant(
  role: MediaVariantRole,
  file: string,
  mime: string,
  width?: number,
  height?: number,
): Promise<ProducedVariant> {
  const [info, data] = await Promise.all([stat(file), readFile(file)])
  return {
    role,
    path: file,
    mime,
    width,
    height,
    bytes: info.size,
    sha256: createHash("sha256").update(data).digest("hex"),
  }
}

function scaledSize(probe: VideoProbe, shortSide: number): { width: number; height: number } {
  const landscape = probe.width >= probe.height
  const short = Math.min(probe.width, probe.height)
  const ratio = shortSide / short
  return landscape
    ? { width: even(probe.width * ratio), height: shortSide }
    : { width: shortSide, height: even(probe.height * ratio) }
}

async function transcode(
  cfg: FfmpegConfig,
  input: string,
  out: string,
  shortSide: number,
  audio: boolean,
): Promise<void> {
  const scale = `scale='if(gte(iw,ih),-2,${shortSide})':'if(gte(iw,ih),${shortSide},-2)':flags=lanczos`
  await ffmpeg(cfg, [
    ...INPUT_GUARD,
    "-i",
    input,
    "-map",
    "0:v:0",
    ...(audio ? ["-map", "0:a:0?"] : []),
    "-vf",
    scale,
    "-fpsmax",
    "30",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-sn",
    "-dn",
    ...(audio ? ["-c:a", "aac", "-b:a", "128k"] : ["-an"]),
    "-f",
    "mp4",
    out,
  ])
}

async function frame(cfg: FfmpegConfig, input: string, out: string, position: string[]): Promise<boolean> {
  try {
    await ffmpeg(cfg, [
      ...position,
      ...INPUT_GUARD,
      "-i",
      input,
      "-frames:v",
      "1",
      "-update",
      "1",
      "-f",
      "image2",
      "-c:v",
      "png",
      out,
    ])
    return (await stat(out)).size > 0
  } catch (err) {
    if (err instanceof FfmpegError && err.timedOut) throw err
    return false
  }
}

export async function processVideo(
  cfg: FfmpegConfig,
  input: string,
  outDir: string,
  options: VideoOptions,
): Promise<ProcessedMedia> {
  let probe: VideoProbe
  try {
    probe = checkProbe(await ffprobe(cfg, input), input, options.maxSeconds)
  } catch (err) {
    if (err instanceof MediaRejectedError) throw err
    throw new MediaRejectedError(
      "Couldn't read this video",
      err instanceof Error ? err.message.slice(0, 200) : "probe failed",
    )
  }

  const audio = probe.hasAudio && !options.stripAudio
  const short = Math.min(probe.width, probe.height)
  const variants: ProducedVariant[] = []
  try {
    const s720 = even(Math.min(720, short))
    const mp4720 = path.join(outDir, "mp4_720.mp4")
    await transcode(cfg, input, mp4720, s720, audio)
    const size720 = scaledSize(probe, s720)
    variants.push(await fileVariant("mp4_720", mp4720, "video/mp4", size720.width, size720.height))
    if (short >= 1080) {
      const mp41080 = path.join(outDir, "mp4_1080.mp4")
      await transcode(cfg, input, mp41080, 1080, audio)
      const size1080 = scaledSize(probe, 1080)
      variants.push(await fileVariant("mp4_1080", mp41080, "video/mp4", size1080.width, size1080.height))
    }

    const firstPng = path.join(outDir, "first.png")
    const at = probe.durationMs >= 1000 ? "0.5" : "0"
    if (!(await frame(cfg, input, firstPng, ["-ss", at]))) {
      throw new MediaRejectedError("Couldn't read this video", "no decodable frame")
    }
    const lastPng = path.join(outDir, "last.png")
    const hasLast = await frame(cfg, input, lastPng, ["-sseof", "-0.25"])

    const poster = path.join(outDir, "poster.webp")
    await sharp(firstPng).webp({ quality: 80 }).toFile(poster)
    variants.push(await fileVariant("poster", poster, "image/webp", probe.width, probe.height))
    const posterLast = path.join(outDir, "poster_last.webp")
    await sharp(hasLast ? lastPng : firstPng)
      .webp({ quality: 80 })
      .toFile(posterLast)
    variants.push(await fileVariant("poster_last", posterLast, "image/webp", probe.width, probe.height))
    const thumb = path.join(outDir, "thumb.webp")
    const thumbInfo = await sharp(firstPng)
      .resize({ width: Math.min(320, probe.width), withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(thumb)
    variants.push(await fileVariant("thumb", thumb, "image/webp", thumbInfo.width, thumbInfo.height))

    const extras = await imageExtras(sharp(firstPng))
    const warnings =
      variants[0]!.bytes > LIGHT_VIDEO_BYTES ? ["mp4_720 is over 8 MB; background videos should stay light"] : []
    return {
      width: probe.width,
      height: probe.height,
      durationMs: probe.durationMs,
      hasAudio: audio,
      ...extras,
      variants,
      describeImage: poster,
      warnings,
    }
  } catch (err) {
    if (err instanceof MediaRejectedError) throw err
    if (err instanceof FfmpegError) {
      throw new MediaRejectedError(
        err.timedOut ? "This video took too long to process" : "Couldn't convert this video",
        err.message.slice(0, 200),
      )
    }
    throw err
  }
}
