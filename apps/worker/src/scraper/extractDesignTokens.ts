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
