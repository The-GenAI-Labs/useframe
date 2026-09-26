import type { Page } from "playwright"

type TokenSet = { color: string; backgroundColor: string; fontFamily: string; fontSize: string } | null

export type DesignTokens = {
  body: TokenSet
  h1: TokenSet
  h2: TokenSet
  p: TokenSet
  btn: TokenSet
}

export async function extractDesignTokens(page: Page): Promise<DesignTokens> {
  const [body, h1, h2, p, btn] = await page.evaluate(
    (selectors: string[]) =>
      selectors.map((selector) => {
        const el = document.querySelector(selector)
        if (!el) return null
        const style = window.getComputedStyle(el)
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
        }
      }),
    ["body", "h1", "h2", "p", "button, .btn, [class*='btn']"],
  )
  return { body: body ?? null, h1: h1 ?? null, h2: h2 ?? null, p: p ?? null, btn: btn ?? null }
}

export type PreciseStyling = {
  backgroundColor: string
  backgroundImage: string
  color: string
  borderRadius: string
  boxShadow: string
  backdropFilter: string
  fontWeight: string
  letterSpacing: string
  opacity: string
  mixBlendMode: string
} | null

// Read directly via getComputedStyle, never vision-guessed - exact gradient
// stops/angle, exact shadow, exact blur, so Step 2 never approximates a
// gradient as a flat colour.
export async function extractPreciseStyling(page: Page, selector: string): Promise<PreciseStyling> {
  return page
    .evaluate((sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const style = window.getComputedStyle(el)
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        color: style.color,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        backdropFilter: style.backdropFilter,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing,
        opacity: style.opacity,
        mixBlendMode: style.mixBlendMode,
      }
    }, selector)
    .catch(() => null)
}

export type NoiseTexture =
  | { present: true; backgroundImage: string; mixBlendMode: string; opacity: string }
  | { present: true; method: "svg_feTurbulence" }
  | { present: false }

// Noise/grain overlays are usually a pseudo-element, not a normal child
// node, so this is checked as its own pass rather than folded into
// extractPreciseStyling.
export async function detectNoiseTexture(page: Page, selector: string): Promise<NoiseTexture> {
  return page
    .evaluate((sel: string) => {
      const el = document.querySelector(sel)
      if (!el) return { present: false as const }
      const pseudos = [window.getComputedStyle(el, "::before"), window.getComputedStyle(el, "::after")]
      for (const pseudo of pseudos) {
        const bg = pseudo.backgroundImage
        const isDataUri = bg.includes("data:image")
        const isTiny = bg.length < 3000
        const hasBlend = pseudo.mixBlendMode !== "normal"
        if ((isDataUri && isTiny) || hasBlend) {
          return {
            present: true as const,
            backgroundImage: bg.slice(0, 200),
            mixBlendMode: pseudo.mixBlendMode,
            opacity: pseudo.opacity,
          }
        }
      }
      const hasTurbulence = !!document.querySelector("feTurbulence")
      return hasTurbulence ? { present: true as const, method: "svg_feTurbulence" as const } : { present: false as const }
    }, selector)
    .catch(() => ({ present: false as const }))
}

// A dark variant is only reported if the page genuinely has one - neither a
// class toggle nor prefers-color-scheme changing anything measurable means
// captureDualMode's caller should treat dark as absent, not fabricate it.
export async function detectDarkModeToggle(page: Page): Promise<boolean> {
  return page
    .evaluate(
      () =>
        document.documentElement.classList.contains("dark") ||
        !!document.querySelector('[data-theme], [class*="dark-mode-toggle"]'),
    )
    .catch(() => false)
}

export async function captureDualMode<T>(
  page: Page,
  hasToggle: boolean,
  captureFn: () => Promise<T>,
): Promise<{ light: T; dark: T }> {
  const light = await captureFn()

  if (hasToggle) {
    await page.evaluate(() => document.documentElement.classList.add("dark"))
  } else {
    await page.emulateMedia({ colorScheme: "dark" })
  }
  await page.waitForTimeout(400)
  const dark = await captureFn()

  return { light, dark }
}
