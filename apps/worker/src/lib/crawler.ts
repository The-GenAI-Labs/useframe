import type { Page } from "playwright"
import { isCrawlAllowed } from "./robotsCheck.js"

export type CrawledPageResult = {
  url: string
  title: string
  metaDescription: string | null
  h1s: string[]
  wordCount: number
  statusCode: number
  bodyText: string
}

const MAX_CRAWL_MS = 120_000
const PAGE_TIMEOUT_MS = 15_000

function normalizeUrl(rawUrl: string): string {
  const u = new URL(rawUrl)
  u.hash = ""
  if (u.pathname !== "/" && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1)
  }
  return u.toString()
}

export async function crawlSite(
  page: Page,
  startUrl: string,
  maxPages = 8,
  seedUrls?: string[]
): Promise<CrawledPageResult[]> {
  const origin = new URL(startUrl).origin
  const normalizedStart = normalizeUrl(startUrl)
  const hasSeed = !!seedUrls && seedUrls.length > 0

  const rootAllowed = await isCrawlAllowed(origin, startUrl)
  if (!rootAllowed) {
    throw new Error(`Crawling disallowed by robots.txt for ${origin}`)
  }

  const visited = new Set<string>()
  const queue: string[] = hasSeed
    ? Array.from(new Set(seedUrls!.map(normalizeUrl).filter((u) => new URL(u).origin === origin)))
    : [normalizedStart]
  const results: CrawledPageResult[] = []
  const startTime = Date.now()

  while (queue.length > 0 && results.length < maxPages) {
    if (Date.now() - startTime > MAX_CRAWL_MS) break

    const url = queue.shift()!
    if (visited.has(url)) continue
    visited.add(url)

    const allowed = await isCrawlAllowed(origin, url)
    if (!allowed) continue

    try {
      const response = await page.goto(url, {
        waitUntil: "networkidle",
        timeout: PAGE_TIMEOUT_MS,
      })

      const extracted = await page.evaluate(() => {
        const title = document.title
        const metaDescription =
          document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null
        const h1s = Array.from(document.querySelectorAll("h1")).map(
          (el) => el.textContent?.trim() ?? ""
        )
        const bodyText = document.body.innerText
        const wordCount = bodyText.split(/\s+/).filter(Boolean).length
        return { title, metaDescription, h1s, bodyText, wordCount }
      })

      results.push({
        url,
        title: extracted.title,
        metaDescription: extracted.metaDescription,
        h1s: extracted.h1s,
        wordCount: extracted.wordCount,
        statusCode: response?.status() ?? 0,
        bodyText: extracted.bodyText,
      })

      if (results.length >= maxPages) break

      // Sitemap-seeded crawls already have the full page list — no need to discover more.
      if (hasSeed) continue

      const links = await page.evaluate(() =>
        Array.from(document.querySelectorAll("a[href]")).map(
          (a) => (a as HTMLAnchorElement).href
        )
      )

      for (const link of links) {
        try {
          const linkUrl = new URL(link)
          if (linkUrl.origin !== origin) continue
          const normalized = normalizeUrl(link)
          if (visited.has(normalized) || queue.includes(normalized)) continue
          queue.push(normalized)
        } catch {
          continue
        }
      }
    } catch {
      continue
    }
  }

  return results
}
