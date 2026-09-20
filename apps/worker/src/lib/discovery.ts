import * as cheerio from "cheerio"

export type DiscoveryResult = {
  urls: string[]
  source: "sitemap" | "robots-sitemap" | "crawl"
}

const FETCH_TIMEOUT_MS = 5000

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

type ParsedSitemap =
  | { kind: "urlset"; urls: string[] }
  | { kind: "index"; sitemapUrls: string[] }
  | { kind: "empty" }

function parseSitemap(xml: string): ParsedSitemap {
  const $ = cheerio.load(xml, { xmlMode: true })

  const urlLocs = $("url > loc")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)

  if (urlLocs.length > 0) {
    return { kind: "urlset", urls: urlLocs }
  }

  const sitemapLocs = $("sitemap > loc")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)

  if (sitemapLocs.length > 0) {
    return { kind: "index", sitemapUrls: sitemapLocs }
  }

  return { kind: "empty" }
}

async function resolveSitemapUrls(xml: string, maxPages: number): Promise<string[]> {
  const parsed = parseSitemap(xml)

  if (parsed.kind === "urlset") {
    return parsed.urls.slice(0, maxPages)
  }

  if (parsed.kind === "index" && parsed.sitemapUrls[0]) {
    // Sitemap index — follow only the first nested sitemap to bound work.
    const nestedXml = await fetchText(parsed.sitemapUrls[0])
    if (nestedXml) {
      const nested = parseSitemap(nestedXml)
      if (nested.kind === "urlset") {
        return nested.urls.slice(0, maxPages)
      }
    }
  }

  return []
}

export async function discoverUrls(startUrl: string, maxPages: number): Promise<DiscoveryResult> {
  const origin = new URL(startUrl).origin

  const sitemapXml = await fetchText(`${origin}/sitemap.xml`)
  if (sitemapXml) {
    const urls = await resolveSitemapUrls(sitemapXml, maxPages)
    if (urls.length > 0) {
      return { urls, source: "sitemap" }
    }
  }

  const robotsTxt = await fetchText(`${origin}/robots.txt`)
  if (robotsTxt) {
    const match = robotsTxt.match(/^Sitemap:\s*(\S+)/im)
    if (match?.[1]) {
      const robotsSitemapXml = await fetchText(match[1])
      if (robotsSitemapXml) {
        const urls = await resolveSitemapUrls(robotsSitemapXml, maxPages)
        if (urls.length > 0) {
          return { urls, source: "robots-sitemap" }
        }
      }
    }
  }

  return { urls: [], source: "crawl" }
}
