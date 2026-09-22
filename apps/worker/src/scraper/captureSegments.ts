import type { Page } from "playwright"

const VIEWPORT_WIDTH = 1280
const PRIME_STEP_SIZE = 400
const DEFAULT_SEGMENT_HEIGHT = 2200

// Playwright caps screenshots at the browser's max texture size; a very tall
// page would otherwise try to allocate one enormous clip.
const MAX_PAGE_HEIGHT = 30_000

// PHASE 1 — priming pass. Takes no screenshots. Forces every lazy-loaded
// image and IntersectionObserver-triggered animation to fire BEFORE any
// capture happens, so segments never race the page's own loading.
//
// This adds real time to every scan — a full extra scroll-through before
// capture starts. That's the correct trade: a fixed-timeout-only approach
// intermittently produces blank or half-faded sections on lazy-load /
// scroll-animation sites (most modern landing pages), and feeding blank
// sections into vision analysis poisons the result with wrong data rather
// than merely being slow.
async function primePageContent(page: Page): Promise<void> {
  const pageHeight = Math.min(
    await page.evaluate(() => document.body.scrollHeight),
    MAX_PAGE_HEIGHT,
  )

  // Smaller steps than the capture segment size — closer to real scroll
  // behavior, and more reliable for libraries keying off scroll events
  // rather than pure intersection.
  for (let scrollY = 0; scrollY < pageHeight; scrollY += PRIME_STEP_SIZE) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY)

    // Wait on a REAL condition, not a guess: every image now in the viewport
    // must finish loading before moving on. One broken image must not fail
    // the whole scan, hence the catch.
    await page
      .evaluate(() =>
        Promise.all(
          Array.from(document.querySelectorAll("img")).map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise((r) => {
                  img.onload = img.onerror = r
                }),
          ),
        ).then(() => undefined),
      )
      .catch(() => {})

    await page.waitForTimeout(300) // settle time for CSS fade/opacity transitions
  }

  await page.waitForTimeout(500) // final settle once fully scrolled
}

// PHASE 2 — capture pass. Runs AFTER priming, so content is already loaded;
// the waits here are short because they're only for re-paint, not loading.
//
// Captures more vertical distance per shot at full native resolution rather
// than scaling the page down — zooming out would degrade the fine detail
// (small text, subtle color/spacing) the vision model actually needs.
// Typically yields 2-3 segments for a normal landing page, vs 6-8
// viewport-height frames.
export async function captureTallSegments(
  page: Page,
  segmentHeight = DEFAULT_SEGMENT_HEIGHT,
): Promise<Buffer[]> {
  await primePageContent(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)

  const pageHeight = Math.min(
    await page.evaluate(() => document.body.scrollHeight),
    MAX_PAGE_HEIGHT,
  )

  const segments: Buffer[] = []

  for (let scrollY = 0; scrollY < pageHeight; scrollY += segmentHeight) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY)
    await page.waitForTimeout(200)

    // The clip is viewport-relative after scrolling, so y is always 0 —
    // height is bounded by whatever page remains below the current offset.
    const height = Math.min(segmentHeight, pageHeight - scrollY)
    if (height <= 0) break

    const shot = await page
      .screenshot({ clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height } })
      .catch(() => null)

    if (shot) segments.push(shot)
  }

  return segments
}
