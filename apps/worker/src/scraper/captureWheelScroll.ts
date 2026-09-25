import type { Page } from "playwright"
import { evaluateSafe } from "./evaluateSafe.js"

const WHEEL_DELTA = 120
const FRAME_INTERVAL_MS = 120
const MAX_FRAMES = 40
const MAX_PAGE_HEIGHT = 30_000

export type WheelFrame = { scrollY: number; image: Buffer }

// Real wheel deltas (not scrollTo jumps) so any smooth-scroll library
// (Lenis, Locomotive, native CSS smooth-scroll) actually engages its own
// easing — captured incrementally as screenshots rather than recorded
// video, since this deployment has no ffmpeg binary to extract frames from
// a video after the fact.
export async function captureWheelScroll(page: Page): Promise<WheelFrame[]> {
  const pageHeight = Math.min(
    await evaluateSafe(page, () => document.body.scrollHeight),
    MAX_PAGE_HEIGHT,
  )
  await evaluateSafe(page, () => window.scrollTo(0, 0))
  await page.waitForTimeout(200)

  const frames: WheelFrame[] = []
  let lastY = -1

  while (frames.length < MAX_FRAMES) {
    await page.mouse.wheel(0, WHEEL_DELTA)
    await page.waitForTimeout(FRAME_INTERVAL_MS)

    const scrollY = await evaluateSafe(page, () => window.scrollY).catch(() => lastY)
    if (scrollY === lastY) break
    lastY = scrollY

    const shot = await page.screenshot().catch(() => null)
    if (shot) frames.push({ scrollY, image: shot })

    if (scrollY >= pageHeight - 10) break
  }

  return frames
}
