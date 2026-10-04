import type { SiteSpec } from "@repo/schemas"

export function buildRobotsTxt(baseUrl: string): string {
  return `User-agent: *\nAllow: /\nSitemap: ${baseUrl.replace(/\/$/, "")}/sitemap.xml\n`
}

function toRoutePath(slug: string): string {
  if (slug === "/" || slug === "" || slug === "home" || slug === "index") return "/"
  return `/${slug.replace(/^\/+/, "")}`
}

export function buildSitemapXml(pages: SiteSpec["pages"], baseUrl: string): string {
  const origin = baseUrl.replace(/\/$/, "")
  const urls = pages
    .map((page) => {
      const path = toRoutePath(page.slug)
      const loc = path === "/" ? origin : `${origin}${path}`
      return `  <url>\n    <loc>${loc}</loc>\n  </url>`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

function pageText(page: SiteSpec["pages"][number]): string {
  const parts: string[] = [page.title]
  for (const section of page.sections) {
    const c = section.content
    if (!c) continue
    if (c.headline) parts.push(c.headline)
    if (c.subheadline) parts.push(c.subheadline)
    if (c.body) parts.push(c.body)
    if (c.items) {
      for (const item of c.items) {
        parts.push(item.title, item.description)
      }
    }
  }
  return parts.join(" ").toLowerCase()
}

export type KeywordValidationResult = {
  pageSlug: string
  declaredKeywords: string[]
  missingKeywords: string[]
  pass: boolean
}

export function validateKeywords(spec: SiteSpec): KeywordValidationResult[] {
  return spec.pages.map((page) => {
    const declared = page.seo?.keywords ?? []
    const text = pageText(page)
    const missing = declared.filter((kw) => !text.includes(kw.toLowerCase()))
    return {
      pageSlug: page.slug,
      declaredKeywords: declared,
      missingKeywords: missing,
      pass: declared.length > 0 && missing.length === 0,
    }
  })
}
