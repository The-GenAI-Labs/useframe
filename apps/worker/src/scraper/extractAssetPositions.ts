import type { Page } from "playwright"

export type PositionedAsset =
  | { type: "image"; url: string; alt: string; section: string; rect: Rect }
  | { type: "video"; url: string; section: string; rect: Rect }
  | { type: "inline_svg"; markup: string; section: string; rect: Rect }
  | { type: "css_background"; value: string; section: string; rect: Rect }
  | { type: "sprite_icon"; backgroundPosition: string; section: string; rect: Rect }

type Rect = { x: number; y: number; w: number; h: number }

export type IconFontUsage = { className: string; fontFamily: string; content: string }

// currentSrc (not src) reflects what a responsive <img srcset> actually
// rendered at this viewport - src can point at a different candidate the
// browser never used. Sprite icons (one background image cropped via
// background-position) are flagged but not pixel-extracted, per the
// hotlink-era scope - Step 1 approximates those with a standalone icon.
export async function extractAssetsWithPosition(page: Page): Promise<PositionedAsset[]> {
  return page
    .evaluate(() => {
      const assets: PositionedAsset[] = []
      const els = document.querySelectorAll("img, video, svg, [style*='background-image']")

      for (const el of Array.from(els)) {
        const rect = el.getBoundingClientRect()
        const section = el.closest("section, header, footer, [class*='section']")
        const sectionId = section?.id || section?.className || "unknown"
        const cs = getComputedStyle(el)
        const r: Rect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height }

        if (el.tagName === "IMG") {
          const img = el as HTMLImageElement
          assets.push({ type: "image", url: img.currentSrc, alt: img.alt, section: String(sectionId), rect: r })
        } else if (el.tagName === "VIDEO") {
          const video = el as HTMLVideoElement
          assets.push({ type: "video", url: video.currentSrc, section: String(sectionId), rect: r })
        } else if (el.tagName === "SVG") {
          assets.push({ type: "inline_svg", markup: el.outerHTML.slice(0, 2000), section: String(sectionId), rect: r })
        } else if (cs.backgroundImage !== "none") {
          if (cs.backgroundPosition !== "0% 0%" && cs.backgroundSize !== "cover" && cs.backgroundSize !== "contain") {
            assets.push({ type: "sprite_icon", backgroundPosition: cs.backgroundPosition, section: String(sectionId), rect: r })
          } else {
            assets.push({ type: "css_background", value: cs.backgroundImage, section: String(sectionId), rect: r })
          }
        }
      }

      return assets
    })
    .catch(() => [])
}

export async function detectIconFonts(page: Page): Promise<IconFontUsage[]> {
  return page
    .$$eval('[class*="icon-"], [class*="fa-"], i[class]', (els) =>
      els.map((el) => ({
        className: el.className,
        fontFamily: getComputedStyle(el).fontFamily,
        content: getComputedStyle(el, "::before").content,
      })),
    )
    .catch(() => [])
}
