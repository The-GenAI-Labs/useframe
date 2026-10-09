import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { buildSiteFiles } from "@repo/site-builder"
import type { ResolvedMediaAsset, SiteSpec } from "@repo/schemas"

const PAYLOADS = [
  "<script>alert(1)</script>",
  '"><img src=x onerror=alert(1)>',
  "javascript:alert(1)",
  "{globalThis.__pwned = true}",
  "`${globalThis.__pwned = true}`",
]
const evil = PAYLOADS.join(" ")

function section(type: SiteSpec["pages"][number]["sections"][number]["type"], index: number) {
  return {
    type,
    index,
    content: {
      headline: evil,
      subheadline: evil,
      body: evil,
      cta: { primary: evil, secondary: evil, primaryHref: "javascript:alert(1)", secondaryHref: "data:text/html,<script>alert(1)</script>" },
      items: [{ title: evil, description: evil, icon: evil }],
      mediaUrl: "javascript:alert(1)",
      mediaAlt: evil,
    },
  }
}

const spec: SiteSpec = {
  siteType: "SINGLE_PAGE",
  copyFramework: "AIDA",
  citations: [],
  designSystem: {
    primaryColor: "red;}</style><script>alert(1)</script>",
    secondaryColor: evil,
    accentColor: evil,
    fontPrimary: '"; } body { background: url(javascript:alert(1)) }',
    fontSecondary: evil,
    spacing: evil,
    borderRadius: evil,
    animationStyle: evil,
  },
  pages: [
    {
      type: "HOME",
      slug: "home",
      title: evil,
      seo: { title: evil, description: evil },
      sections: (["HERO", "FEATURES", "HOW_IT_WORKS", "TESTIMONIALS", "PRICING", "CTA", "FAQ", "CONTACT", "FOOTER", "CUSTOM"] as const).map(section),
    },
  ],
}

const tmpDir = join(process.cwd(), "src", ".xss-tmp")

afterAll(() => rmSync(tmpDir, { recursive: true, force: true }))

describe("site-builder output encoding", () => {
  it("renders hostile brief text as inert text and drops unsafe hrefs", async () => {
    const files = buildSiteFiles(spec)
    mkdirSync(tmpDir, { recursive: true })
    const app = files.find((f) => f.path === "src/App.jsx")!.content
    writeFileSync(join(tmpDir, "App.jsx"), `import * as React from "react"\n${app}`)

    ;(globalThis as Record<string, unknown>).React = React
    const mod = (await import(/* @vite-ignore */ join(tmpDir, "App.jsx"))) as { default: React.ComponentType }
    const html = renderToStaticMarkup(React.createElement(mod.default))

    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined()
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<img/i)
    expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i)
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!)
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href).not.toMatch(/^\s*(javascript|data|vbscript):/i)
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")

    const indexHtml = files.find((f) => f.path === "index.html")!.content
    expect(indexHtml.match(/<script/g)).toHaveLength(1)
    expect(indexHtml).not.toContain("<img")

    const css = files.find((f) => f.path === "src/index.css")!.content
    expect(css).not.toContain("</style>")
    expect(css).not.toContain("javascript:")
    expect(css).not.toContain("<script")
  })

  it("renders hostile alt text and titles on media as inert attributes", async () => {
    const asset = (id: string, kind: "IMAGE" | "VIDEO"): ResolvedMediaAsset => ({
      id,
      kind,
      origin: "UPLOADED",
      status: "READY",
      deleted: false,
      title: evil,
      width: 1600,
      height: 900,
      durationMs: kind === "VIDEO" ? 5000 : null,
      dominantColor: 'red;background:url(javascript:alert(1))',
      lqip: null,
      altText: evil,
      decorative: false,
      variants:
        kind === "IMAGE"
          ? [
              { role: "w960", mime: "image/webp", width: 960, height: 540, bytes: 1, sha256: "a".repeat(64), url: "https://api.test/m/w960?sig=1" },
              { role: "fallback", mime: "image/jpeg", width: 1600, height: 900, bytes: 1, sha256: "b".repeat(64), url: 'javascript:alert(1)//"' },
            ]
          : [
              { role: "mp4_720", mime: "video/mp4", width: 1280, height: 720, bytes: 1, sha256: "c".repeat(64), url: "https://api.test/m/v?sig=1" },
              { role: "poster", mime: "image/webp", width: 1280, height: 720, bytes: 1, sha256: "d".repeat(64), url: "https://api.test/m/p?sig=1" },
            ],
    })
    const mediaSpec: SiteSpec = {
      ...spec,
      media: {
        "home/hero-0/visual": { assetId: "img", alt: evil },
        "home/how_it_works-2/item-0": { assetId: "vid", alt: evil, objectPosition: "center" },
      },
    }
    const exported = buildSiteFiles(mediaSpec, undefined, { media: { target: "export", assets: [asset("img", "IMAGE"), asset("vid", "VIDEO")] } })
    const preview = buildSiteFiles(mediaSpec, undefined, { media: { target: "preview", assets: [asset("img", "IMAGE"), asset("vid", "VIDEO")] } })

    for (const [name, files] of [["export", exported], ["preview", preview]] as const) {
      const app = files.find((f) => f.path === "src/App.jsx")!.content
      writeFileSync(join(tmpDir, `Media-${name}.jsx`), `import * as React from "react"
${app}`)
      const mod = (await import(/* @vite-ignore */ join(tmpDir, `Media-${name}.jsx`))) as { default: React.ComponentType }
      const html = renderToStaticMarkup(React.createElement(mod.default))

      expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined()
      expect(html).not.toMatch(/<script/i)
      // Hostile text inside quoted (escaped) attribute values is inert; real handlers would be bare attributes.
      expect(html.replace(/"[^"]*"/g, '""')).not.toMatch(/<[^>]*\son\w+\s*=/i)
      expect(html).not.toMatch(/(src|srcset|poster)="\s*javascript:/i)
      expect(html).not.toContain("url(javascript:")
      expect(html).toMatch(/<video[^>]*aria-label="&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
      if (name === "export") expect(html).toMatch(/<img[^>]*src="\/media\/img\/fallback\.bbbbbbbb\.jpg"/)
      // The unsafe preview fallback URL is refused, which drops the image entirely.
      else expect(html).not.toContain("<img")
    }
  })
})
