import type { MediaVariantRole } from "@repo/schemas"

export type ProducedVariant = {
  role: MediaVariantRole
  path: string
  mime: string
  width?: number
  height?: number
  bytes: number
  sha256: string
}

export type ProcessedMedia = {
  width: number
  height: number
  durationMs?: number
  hasAudio?: boolean
  dominantColor: string | null
  lqip: string | null
  variants: ProducedVariant[]
  // The image handed to the describe step (w960 or the poster).
  describeImage: string | null
  warnings: string[]
}
