import type { Page } from "playwright"
import { isWithinPinnedRange, type PinnedRange } from "./detectPinnedSections.js"

const VIEWPORT_WIDTH = 1280
const VIEWPORT_HEIGHT = 800
const COARSE_STEP_RATIO = 0.15
const PINNED_STEP_SIZE = 100
const MAX_PAGE_HEIGHT = 30_000
const MAX_FRAMES = 60

export type DenseFrame = { scrollY: number; hasVideo: boolean; image: Buffer }

export async function captureFullPageShot(page: Page): Promise<Buffer> {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  return page.screenshot({ fullPage: true }).catch(() => Buffer.alloc(0))
}

export async function captureDenseFrames(
  page: Page,
  pinnedRanges: PinnedRange[],
): Promise<DenseFrame[]> {
  const pageHeight = Math.min(
    await page.evaluate(() => document.body.scrollHeight),
    MAX_PAGE_HEIGHT,
  )
  const coarseStep = Math.max(50, Math.round(VIEWPORT_HEIGHT * COARSE_STEP_RATIO))

  const frames: DenseFrame[] = []
  let scrollY = 0

  while (scrollY < pageHeight && frames.length < MAX_FRAMES) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY)
    await page.waitForTimeout(150)

    const hasVideo = await page
      .evaluate(() => document.querySelectorAll("video").length > 0)
      .catch(() => false)

    const shot = await page
      .screenshot({ clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT } })
      .catch(() => null)
    if (shot) frames.push({ scrollY, hasVideo, image: shot })

    scrollY += isWithinPinnedRange(scrollY, pinnedRanges) ? PINNED_STEP_SIZE : coarseStep
  }

  return frames
}
