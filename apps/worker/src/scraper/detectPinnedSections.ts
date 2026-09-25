import type { Page } from "playwright"
import { evaluateSafe } from "./evaluateSafe.js"

export type PinnedRange = { startY: number; endY: number }

export type PageRecon = {
  usesVirtualization: boolean
  scrollLibrary: string | null
  pinnedRanges: PinnedRange[]
}

const SCROLL_LIBRARY_MARKERS: Record<string, string> = {
  "data-scroll-container": "locomotive-scroll",
  "data-lenis": "lenis",
  "[data-gsap]": "gsap",
}

export async function detectPageRecon(page: Page): Promise<PageRecon> {
  const usesVirtualization = await evaluateSafe(page, () => {
    const markers = ['[data-virtuoso-scroller]', '[class*="virtual-list"]', '[class*="react-window"]', '[class*="react-virtualized"]']
    return markers.some((sel) => document.querySelector(sel) !== null)
  }).catch(() => false)

  const scrollLibrary = await evaluateSafe(
    page,
    (markers: Record<string, string>) => {
      for (const [selector, name] of Object.entries(markers)) {
        const attr = selector.startsWith("[") ? selector.slice(1, -1) : selector
        if (document.querySelector(`[${attr}]`)) return name
      }
      const w = window as unknown as Record<string, unknown>
      if (w.gsap && (w.gsap as { ScrollTrigger?: unknown }).ScrollTrigger) return "gsap-scrolltrigger"
      return null
    },
    SCROLL_LIBRARY_MARKERS,
  ).catch(() => null)

  const pinnedRanges = await evaluateSafe(page, () => {
    const ranges: { startY: number; endY: number }[] = []
    const candidates = document.querySelectorAll('[style*="position: sticky"], [style*="position:sticky"], [class*="sticky"], [class*="pin"]')
    for (const el of Array.from(candidates)) {
      const style = window.getComputedStyle(el)
      if (style.position !== "sticky" && style.position !== "fixed") continue
      const rect = el.getBoundingClientRect()
      const top = window.scrollY + rect.top
      const parent = el.parentElement
      const parentHeight = parent?.getBoundingClientRect().height ?? rect.height
      ranges.push({ startY: Math.max(0, top - 100), endY: top + parentHeight })
    }
    return ranges
  }).catch(() => [])

  return { usesVirtualization, scrollLibrary, pinnedRanges }
}

export function isWithinPinnedRange(y: number, ranges: PinnedRange[]): boolean {
  return ranges.some((r) => y >= r.startY && y <= r.endY)
}
