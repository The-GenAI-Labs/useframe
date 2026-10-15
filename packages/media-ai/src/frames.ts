import { VIDEO_FRAME_SIZES, type Aspect } from "./constants.js"

export type Size = { width: number; height: number }

// GPT Image 2.5 custom sizes: both edges multiples of 16, at most 3840 px per
// edge, total pixels in [655 360, 8 294 400], ratio within 1:3..3:1.
export const IMAGE_MIN_PIXELS = 655_360
export const IMAGE_MAX_PIXELS = 8_294_400
export const IMAGE_MAX_EDGE = 3840
export const STANDARD_SIZES: Size[] = [
  { width: 1536, height: 1024 },
  { width: 1024, height: 1536 },
  { width: 1024, height: 1024 },
]

const RATIOS: Record<Aspect, number> = { "16:9": 16 / 9, "4:3": 4 / 3, "1:1": 1, "3:4": 3 / 4, "9:16": 9 / 16, "21:9": 21 / 9 }

const round16 = (n: number) => Math.max(16, Math.round(n / 16) * 16)

export function videoFrameSize(aspect: Aspect): Size {
  return VIDEO_FRAME_SIZES[aspect]
}

export function stillSize(aspect: Aspect): Size {
  const ratio = RATIOS[aspect]
  return ratio >= 1 ? { width: 1792, height: round16(1792 / ratio) } : { width: round16(1792 * ratio), height: 1792 }
}

export function isValidImageSize(s: Size): boolean {
  const pixels = s.width * s.height
  const ratio = s.width / s.height
  return (
    s.width % 16 === 0 &&
    s.height % 16 === 0 &&
    Math.max(s.width, s.height) <= IMAGE_MAX_EDGE &&
    pixels >= IMAGE_MIN_PIXELS &&
    pixels <= IMAGE_MAX_PIXELS &&
    ratio >= 1 / 3 &&
    ratio <= 3
  )
}

// The size to ask the image API for so the result can be resized to `target`
// without upscaling (768x768 is below the API's pixel minimum, for example).
export function requestSizeFor(target: Size): Size {
  if (isValidImageSize(target)) return target
  const scale = Math.sqrt(IMAGE_MIN_PIXELS / (target.width * target.height))
  let size = { width: round16(target.width * scale), height: round16(target.height * scale) }
  while (size.width * size.height < IMAGE_MIN_PIXELS) size = { width: size.width + 16, height: round16((size.width + 16) * (target.height / target.width)) }
  return size
}

export function nearestStandardSize(target: Size): Size {
  const ratio = target.width / target.height
  return STANDARD_SIZES.reduce((best, s) =>
    Math.abs(Math.log(s.width / s.height / ratio)) < Math.abs(Math.log(best.width / best.height / ratio)) ? s : best,
  )
}
