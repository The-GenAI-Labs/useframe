import type { Page, Response } from "playwright"

export type AssetManifest = {
  images: string[]
  svgs: string[]
  videos: string[]
  fonts: string[]
}

const ASSET_PATTERNS: { key: keyof AssetManifest; test: (contentType: string, url: string) => boolean }[] = [
  { key: "svgs", test: (ct, url) => ct.includes("svg") || url.endsWith(".svg") },
  { key: "images", test: (ct) => ct.startsWith("image/") },
  { key: "videos", test: (ct) => ct.startsWith("video/") },
  { key: "fonts", test: (ct, url) => ct.includes("font") || /\.(woff2?|ttf|otf)(\?|$)/.test(url) },
]

export function attachAssetListener(page: Page): { manifest: AssetManifest; detach: () => void } {
  const manifest: AssetManifest = { images: [], svgs: [], videos: [], fonts: [] }
  const seen = new Set<string>()

  const onResponse = (response: Response) => {
    const url = response.url()
    if (seen.has(url)) return
    const contentType = response.headers()["content-type"] ?? ""
    for (const pattern of ASSET_PATTERNS) {
      if (pattern.test(contentType, url)) {
        seen.add(url)
        manifest[pattern.key].push(url)
        break
      }
    }
  }

  page.on("response", onResponse)
  return { manifest, detach: () => page.off("response", onResponse) }
}
