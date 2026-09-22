import type { ElementHandle, Page } from "playwright"

// Common markers used by scroll-animation libraries (AOS, Framer-style
// utility classes, Tailwind animate-*).
const ANIMATION_SELECTORS = '[class*="animate"], [class*="reveal"], [data-aos], [class*="fade"]'

const MAX_CANDIDATES = 3 // bounds cost — each candidate costs two screenshots
const ANIMATION_SETTLE_MS = 500 // typical animation duration

async function waitForElementImages(el: ElementHandle<SVGElement | HTMLElement>): Promise<void> {
  await el
    .evaluate((node) =>
      Promise.all(
        Array.from(node.querySelectorAll("img")).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((r) => {
                img.onload = img.onerror = r
              }),
        ),
      ).then(() => undefined),
    )
    .catch(() => {})
}

// Targeted before/after pairs, for motion patterns ONLY — static properties
// are fully covered by captureTallSegments. Returns 0-6 frames depending on
// how many animated elements exist.
//
// If no animation-library markers are found this returns an empty array, and
// that's the right outcome: motionPatterns in the analysis then stays empty
// rather than being guessed from frames that show no motion.
export async function captureMotionMoments(page: Page): Promise<Buffer[]> {
  const candidates = await page.$$(ANIMATION_SELECTORS).catch(() => [])
  const frames: Buffer[] = []

  for (const el of candidates.slice(0, MAX_CANDIDATES)) {
    try {
      await el.scrollIntoViewIfNeeded({ timeout: 5_000 })
      // Don't race a lazy image inside this specific element.
      await waitForElementImages(el)

      // The box is re-read after the animation because a reveal animation
      // commonly changes the element's own position/size (slide-up, scale);
      // reusing the "before" box would clip the "after" shot incorrectly.
      const beforeBox = await el.boundingBox()
      if (!beforeBox) continue
      const before = await page.screenshot({ clip: beforeBox })

      await page.waitForTimeout(ANIMATION_SETTLE_MS)

      const afterBox = (await el.boundingBox()) ?? beforeBox
      const after = await page.screenshot({ clip: afterBox })

      frames.push(before, after)
    } catch {
      // A single uncooperative element (detached, off-screen, zero-size)
      // shouldn't cost us the other candidates.
      continue
    }
  }

  return frames
}
