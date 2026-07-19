import type { SiteSpec } from "@repo/schemas"
import type { FileSystemTree } from "@webcontainer/api"

function cssVars(ds: SiteSpec["designSystem"]): string {
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

function sectionToJsx(section: SiteSpec["pages"][number]["sections"][number]): string {
  const c = section.content ?? {}
  const headline = c.headline ?? section.type
  const subheadline = c.subheadline ?? ""
  const body = c.body ?? ""
  const ctaPrimary = c.cta?.primary ?? ""
  const items = c.items ?? []

  switch (section.type) {
    case "HERO":
      return `
<section style={{ padding: "80px 24px", textAlign: "center", background: "var(--primary)", color: "#fff" }}>
  <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, marginBottom: "1rem" }}>${headline}</h1>
  ${subheadline ? `<p style={{ fontSize: "1.25rem", opacity: 0.85, marginBottom: "2rem" }}>${subheadline}</p>` : ""}
  ${ctaPrimary ? `<a href="#" style={{ display: "inline-block", padding: "14px 32px", background: "#fff", color: "var(--primary)", borderRadius: "var(--radius)", fontWeight: 700, textDecoration: "none" }}>${ctaPrimary}</a>` : ""}
</section>`

    case "FEATURES":
      return `
<section style={{ padding: "80px 24px", maxWidth: "1100px", margin: "0 auto" }}>
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
<section style={{ padding: "80px 24px", background: "var(--accent)", textAlign: "center" }}>
  <h2 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>${headline}</h2>
  ${body ? `<p style={{ marginBottom: "2rem", color: "#374151" }}>${body}</p>` : ""}
  ${ctaPrimary ? `<a href="#" style={{ display: "inline-block", padding: "14px 32px", background: "var(--primary)", color: "#fff", borderRadius: "var(--radius)", fontWeight: 700, textDecoration: "none" }}>${ctaPrimary}</a>` : ""}
</section>`

    case "FOOTER":
      return `
<footer style={{ padding: "2rem 24px", borderTop: "1px solid #e5e7eb", textAlign: "center", color: "#9ca3af", fontSize: ".85rem" }}>
  <p>${headline || "© 2025 All rights reserved."}</p>
</footer>`

    default:
      return `
<section style={{ padding: "60px 24px", maxWidth: "900px", margin: "0 auto" }}>
  <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1rem" }}>${headline}</h2>
  ${body ? `<p style={{ color: "#374151" }}>${body}</p>` : ""}
</section>`
  }
}

function pageToComponent(page: SiteSpec["pages"][number], isDefault: boolean): string {
  const sections = page.sections.map(sectionToJsx).join("\n")
  const componentName = isDefault ? "HomePage" : `${page.type}Page`
  return `
export default function ${componentName}() {
  return (
    <main>
      ${sections}
    </main>
  )
}
`
}

export function buildFsTree(spec: SiteSpec): FileSystemTree {
  const homePage = spec.pages.find((p) => p.type === "HOME") ?? spec.pages[0]!
  const otherPages = spec.pages.filter((p) => p !== homePage)

  const files: FileSystemTree = {
    "package.json": {
      file: {
        contents: JSON.stringify(
          {
            name: "preview",
            private: true,
            scripts: { dev: "next dev", build: "next build", start: "next start" },
            dependencies: { next: "14.2.5", react: "18.3.1", "react-dom": "18.3.1" },
          },
          null,
          2
        ),
      },
    },
    "next.config.js": {
      file: { contents: "/** @type {import('next').NextConfig} */\nmodule.exports = {}" },
    },
    app: {
      directory: {
        "layout.tsx": {
          file: {
            contents: `import "./globals.css"
export const metadata = { title: "${homePage.seo?.title ?? homePage.title}", description: "${homePage.seo?.description ?? ""}" }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec.designSystem.fontPrimary)}:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}`,
          },
        },
        "globals.css": { file: { contents: cssVars(spec.designSystem) } },
        "page.tsx": { file: { contents: pageToComponent(homePage, true) } },
        ...Object.fromEntries(
          otherPages.map((page) => [
            page.slug,
            {
              directory: {
                "page.tsx": { file: { contents: pageToComponent(page, false) } },
              },
            } as FileSystemTree[string],
          ])
        ),
      },
    },
  }

  return files
}
