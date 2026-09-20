import type { SiteSpec } from "@repo/schemas"

export type SeoFiles = {
  robotsTxt?: string
  sitemapXml?: string
}

export type GeneratedFile = { path: string; content: string }

export function cssVars(ds: SiteSpec["designSystem"]): string {
  return `:root {
  --primary: ${ds.primaryColor};
  --secondary: ${ds.secondaryColor};
  --accent: ${ds.accentColor};
  --font-primary: "${ds.fontPrimary}", system-ui, sans-serif;
  --font-secondary: "${ds.fontSecondary}", system-ui, sans-serif;
  --radius: ${ds.borderRadius === "none" ? "0" : ds.borderRadius === "sm" ? "4px" : ds.borderRadius === "lg" ? "12px" : ds.borderRadius === "full" ? "9999px" : "8px"};
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-primary);
  color: #111;
  background: #fff;
  line-height: 1.6;
}
`
}

export function sectionToJsx(section: SiteSpec["pages"][number]["sections"][number]): string {
  const c = section.content ?? {}
  const headline = c.headline ?? section.type
  const subheadline = c.subheadline ?? ""
  const body = c.body ?? ""
  const ctaPrimary = c.cta?.primary ?? ""
  const items = c.items ?? []

  // Only emitted when a section actually carries citations, so generated
  // markup stays clean for the common case. Consumed by the citationHover.js
  // script this same package injects via buildSiteFiles — one shared
  // definition keeps the WebContainer preview and the real deployed build
  // from ever drifting apart on this.
  const citationAttr =
    section.citationIds && section.citationIds.length > 0
      ? ` data-citation-ids={${JSON.stringify(JSON.stringify(section.citationIds))}}`
      : ""

  switch (section.type) {
    case "HERO":
      return `
<section${citationAttr} style={{ padding: "80px 24px", textAlign: "center", background: "var(--primary)", color: "#fff" }}>
  <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, marginBottom: "1rem" }}>${headline}</h1>
  ${subheadline ? `<p style={{ fontSize: "1.25rem", opacity: 0.85, marginBottom: "2rem" }}>${subheadline}</p>` : ""}
  ${ctaPrimary ? `<a href="#" style={{ display: "inline-block", padding: "14px 32px", background: "#fff", color: "var(--primary)", borderRadius: "var(--radius)", fontWeight: 700, textDecoration: "none" }}>${ctaPrimary}</a>` : ""}
</section>`

    case "FEATURES":
      return `
<section${citationAttr} style={{ padding: "80px 24px", maxWidth: "1100px", margin: "0 auto" }}>
  <h2 style={{ fontSize: "2rem", fontWeight: 700, textAlign: "center", marginBottom: "3rem" }}>${headline}</h2>
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem" }}>
    ${items.map(item => `<div style={{ padding: "1.5rem", border: "1px solid #e5e7eb", borderRadius: "var(--radius)" }}>
      <h3 style={{ fontWeight: 600, marginBottom: ".5rem" }}>${item.title}</h3>
      <p style={{ color: "#6b7280", fontSize: ".9rem" }}>${item.description}</p>
    </div>`).join("\n    ")}
  </div>
</section>`

    case "CTA":
      return `
<section${citationAttr} style={{ padding: "80px 24px", background: "var(--accent)", textAlign: "center" }}>
  <h2 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>${headline}</h2>
  ${body ? `<p style={{ marginBottom: "2rem", color: "#374151" }}>${body}</p>` : ""}
  ${ctaPrimary ? `<a href="#" style={{ display: "inline-block", padding: "14px 32px", background: "var(--primary)", color: "#fff", borderRadius: "var(--radius)", fontWeight: 700, textDecoration: "none" }}>${ctaPrimary}</a>` : ""}
</section>`

    case "FOOTER":
      return `
<footer${citationAttr} style={{ padding: "2rem 24px", borderTop: "1px solid #e5e7eb", textAlign: "center", color: "#9ca3af", fontSize: ".85rem" }}>
  <p>${headline || "© 2025 All rights reserved."}</p>
</footer>`

    default:
      return `
<section${citationAttr} style={{ padding: "60px 24px", maxWidth: "900px", margin: "0 auto" }}>
  <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1rem" }}>${headline}</h2>
  ${body ? `<p style={{ color: "#374151" }}>${body}</p>` : ""}
</section>`
  }
}

export function pageToComponent(page: SiteSpec["pages"][number], componentName: string): string {
  const sections = page.sections.map(sectionToJsx).join("\n")
  return `export default function ${componentName}() {
  return (
    <main>
      ${sections}
    </main>
  )
}
`
}

export function toRoutePath(slug: string): string {
  if (slug === "/" || slug === "" || slug === "home" || slug === "index") return "/"
  return `/${slug.replace(/^\/+/, "")}`
}

export function toComponentName(slug: string, index: number): string {
  const cleaned = slug.replace(/[^a-zA-Z0-9]+/g, " ").trim()
  const pascal = cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("")
  return pascal || `Page${index}`
}

export type PageMeta = {
  page: SiteSpec["pages"][number]
  componentName: string
  routePath: string
  fileName: string
}

export function buildPageMeta(spec: SiteSpec): PageMeta[] {
  return spec.pages.map((page, i) => ({
    page,
    componentName: toComponentName(page.slug, i) + "Page",
    routePath: toRoutePath(page.slug),
    fileName: `${toComponentName(page.slug, i)}.jsx`,
  }))
}

/**
 * Produces the same Vite+React scaffold used for the live WebContainer
 * preview, as a flat file list — usable both by a FileSystemTree consumer
 * (web) and a real `vite build` run against files written to disk (worker).
 * Keeping this one shared implementation is what guarantees the deployed
 * site matches what the user approved in preview.
 */
export function buildSiteFiles(spec: SiteSpec, seoFiles?: SeoFiles): GeneratedFile[] {
  const homePage = spec.pages.find((p) => p.type === "HOME") ?? spec.pages[0]!
  const pageMeta = buildPageMeta(spec)
  const isMultiPage = pageMeta.length > 1

  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${homePage.seo?.title ?? homePage.title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec.designSystem.fontPrimary)}:wght@400;600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`

  const mainJsxSinglePage = `import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"
import "./citationHover.js"

createRoot(document.getElementById("root")).render(<App />)
`

  const mainJsxMultiPage = `import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import "./index.css"
import "./citationHover.js"

createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
`

  // Plain vanilla JS (no React dep) so it works identically regardless of
  // which page/route is mounted. Delegated listeners on document.body pick
  // up the closest [data-citation-ids] ancestor and postMessage the hover
  // state to the parent window — consumed by PreviewPane.tsx in apps/web.
  const citationHoverJs = `let activeEl = null

function findCitationTarget(el) {
  return el && el.closest ? el.closest("[data-citation-ids]") : null
}

document.body.addEventListener("mouseover", (e) => {
  const target = findCitationTarget(e.target)
  if (!target || target === activeEl) return
  activeEl = target
  let citationIds = []
  try {
    citationIds = JSON.parse(target.getAttribute("data-citation-ids") || "[]")
  } catch {}
  if (citationIds.length === 0) return
  const rect = target.getBoundingClientRect()
  window.parent.postMessage(
    { type: "citation-hover", citationIds, rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } },
    "*"
  )
})

document.body.addEventListener("mouseout", (e) => {
  const target = findCitationTarget(e.target)
  if (!target || target !== activeEl) return
  const related = findCitationTarget(e.relatedTarget)
  if (related === activeEl) return
  activeEl = null
  window.parent.postMessage({ type: "citation-hover-end" }, "*")
})
`

  const appJsxSinglePage = pageToComponent(homePage, "App")

  const appJsxMultiPage = `import { Routes, Route } from "react-router-dom"
${pageMeta.map((m) => `import ${m.componentName} from "./pages/${m.fileName.replace(".jsx", "")}"`).join("\n")}

export default function App() {
  return (
    <Routes>
      ${pageMeta.map((m) => `<Route path="${m.routePath}" element={<${m.componentName} />} />`).join("\n      ")}
    </Routes>
  )
}
`

  const packageJson = JSON.stringify(
    {
      name: "preview",
      private: true,
      type: "module",
      scripts: { dev: "vite --host", build: "vite build" },
      dependencies: {
        react: "18.3.1",
        "react-dom": "18.3.1",
        ...(isMultiPage ? { "react-router-dom": "6.26.2" } : {}),
      },
      devDependencies: { vite: "5.4.0", "@vitejs/plugin-react": "4.3.1" },
    },
    null,
    2
  )

  const viteConfig = `import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: { host: true, strictPort: false },
})
`

  const files: GeneratedFile[] = [
    { path: "package.json", content: packageJson },
    { path: "vite.config.js", content: viteConfig },
    { path: "index.html", content: indexHtml },
    { path: "src/main.jsx", content: isMultiPage ? mainJsxMultiPage : mainJsxSinglePage },
    { path: "src/App.jsx", content: isMultiPage ? appJsxMultiPage : appJsxSinglePage },
    { path: "src/index.css", content: cssVars(spec.designSystem) },
    { path: "src/citationHover.js", content: citationHoverJs },
  ]

  if (isMultiPage) {
    for (const m of pageMeta) {
      files.push({ path: `src/pages/${m.fileName}`, content: pageToComponent(m.page, m.componentName) })
    }
  }

  if (seoFiles?.robotsTxt) {
    files.push({ path: "public/robots.txt", content: seoFiles.robotsTxt })
  }
  if (seoFiles?.sitemapXml) {
    files.push({ path: "public/sitemap.xml", content: seoFiles.sitemapXml })
  }

  return files
}
