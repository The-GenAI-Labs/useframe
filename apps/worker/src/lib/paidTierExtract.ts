import type { Page } from "playwright"

export type JsonLdBlock = { type: string | null; raw: unknown }

export type LinkBreakdown = {
  internalCount: number
  externalCount: number
  internalUrls: string[]
  externalUrls: string[]
}

export type PaidTierPageData = {
  url: string
  jsonLd: JsonLdBlock[]
  links: LinkBreakdown
  // Extension point for future custom checks — always empty today.
  customChecks: []
}

export async function extractPaidTierData(
  page: Page,
  pageUrl: string,
  origin: string
): Promise<PaidTierPageData> {
  const jsonLd = await page.evaluate(() => {
    const blocks = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    )
    return blocks.map((el) => {
      try {
        const parsed = JSON.parse(el.textContent ?? "")
        const type = typeof parsed?.["@type"] === "string" ? parsed["@type"] : null
        return { type, raw: parsed }
      } catch {
        return { type: null, raw: null }
      }
    })
  })

  const links = await page.evaluate((originArg) => {
    const anchors = Array.from(document.querySelectorAll("a[href]")) as HTMLAnchorElement[]
    const internalUrls: string[] = []
    const externalUrls: string[] = []

    for (const a of anchors) {
      try {
        const url = new URL(a.href)
        if (url.origin === originArg) {
          internalUrls.push(url.toString())
        } else {
          externalUrls.push(url.toString())
        }
      } catch {
        continue
      }
    }

    return { internalUrls, externalUrls }
  }, origin)

  return {
    url: pageUrl,
    jsonLd,
    links: {
      internalCount: links.internalUrls.length,
      externalCount: links.externalUrls.length,
      internalUrls: links.internalUrls,
      externalUrls: links.externalUrls,
    },
    customChecks: [],
  }
}
