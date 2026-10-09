import { safeHref, type ResolvedMediaAsset, type Section, type SiteSpec } from "@repo/schemas";
import {
  createMediaContext,
  hasBoundSlot,
  listMediaSlots,
  MEDIA_PLAYBACK_JS,
  renderSlotMedia,
  slotIdOf,
  slotsForSection,
  type MediaFileRef,
  type MediaRenderContext,
  type MediaTarget,
} from "./media.js";

export type SeoFiles = {
  robotsTxt?: string;
  sitemapXml?: string;
};

export type GeneratedFile = { path: string; content: string };

// User- and model-supplied strings reach generated source code, so every
// value is emitted as a JS string literal inside a JSX expression (React then
// escapes it as text) and every href goes through safeHref.
function jsxText(value: unknown): string {
  return `{${JSON.stringify(typeof value === "string" ? value : "")}}`;
}

function jsxHref(value: unknown): string {
  return `{${JSON.stringify(safeHref(value) ?? "#")}}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cssColor(value: string, fallback: string): string {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value : fallback;
}

export function cssFontName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9 \-]/g, "").trim().slice(0, 60);
  return cleaned || "Inter";
}

export function cssVars(ds: SiteSpec["designSystem"]): string {
  return `:root {
  --primary: ${cssColor(ds.primaryColor, "#2563EB")};
  --secondary: ${cssColor(ds.secondaryColor, "#F1F5F9")};
  --accent: ${cssColor(ds.accentColor, "#F97316")};
  --font-primary: "${cssFontName(ds.fontPrimary)}", system-ui, sans-serif;
  --font-secondary: "${cssFontName(ds.fontSecondary)}", system-ui, sans-serif;
  --radius: ${ds.borderRadius === "none" ? "0" : ds.borderRadius === "sm" ? "4px" : ds.borderRadius === "lg" ? "12px" : ds.borderRadius === "full" ? "9999px" : "8px"};
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-primary);
  color: #111;
  background: #fff;
  line-height: 1.6;
}
`;
}

type SectionMedia = { ctx: MediaRenderContext; pageSlug: string };

function slotMarkup(media: SectionMedia | undefined, section: Section, key: string): string {
  if (!media) return "";
  const slot = slotsForSection(section).find((s) => s.key === key);
  return slot ? renderSlotMedia(media.ctx, slotIdOf(media.pageSlug, section, key), slot) : "";
}

function itemCards(items: NonNullable<Section["content"]>["items"], itemMedia: (i: number) => string): string {
  return (items ?? [])
    .map((item, i) => {
      const visual = itemMedia(i);
      return `<div style={{ padding: "1.5rem", border: "1px solid #e5e7eb", borderRadius: "var(--radius)" }}>
      ${visual ? `<div style={{ marginBottom: "1rem" }}>${visual}</div>` : ""}<h3 style={{ fontWeight: 600, marginBottom: ".5rem" }}>${jsxText(item.title)}</h3>
      <p style={{ color: "#6b7280", fontSize: ".9rem" }}>${jsxText(item.description)}</p>
    </div>`;
    })
    .join("\n    ");
}

const ITEMS_GRID = `display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "2rem"`;

export function sectionToJsx(section: Section, media?: SectionMedia): string {
  const c = section.content ?? {};
  const headline = c.headline ?? section.type;
  const subheadline = c.subheadline ?? "";
  const body = c.body ?? "";
  const ctaPrimary = c.cta?.primary ?? "";
  const ctaHref = jsxHref(c.cta?.primaryHref);
  const items = c.items ?? [];
  const itemMedia = (i: number) => slotMarkup(media, section, `item-${i}`);

  // Only emitted when a section actually carries citations, so generated
  // markup stays clean for the common case. Consumed by the citationHover.js
  // script this same package injects via buildSiteFiles — one shared
  // definition keeps the WebContainer preview and the real deployed build
  // from ever drifting apart on this.
  const citationAttr =
    section.citationIds && section.citationIds.length > 0
      ? ` data-citation-ids={${JSON.stringify(JSON.stringify(section.citationIds))}}`
      : "";

  // Background media sits at z 0, its scrim at z 1 and the content above both.
  const background = slotMarkup(media, section, "background");
  const layered = background ? `position: "relative", overflow: "hidden", ` : "";
  const front = (inner: string) =>
    background ? `<div style={{ position: "relative", zIndex: 2 }}>${inner}</div>` : inner;

  switch (section.type) {
    case "HERO": {
      const visual = slotMarkup(media, section, "visual");
      return `
<section${citationAttr} style={{ ${layered}padding: "80px 24px", textAlign: "center", background: "var(--primary)", color: "#fff" }}>
  ${background}${front(`
  <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", fontWeight: 800, marginBottom: "1rem" }}>${jsxText(headline)}</h1>
  ${subheadline ? `<p style={{ fontSize: "1.25rem", opacity: 0.85, marginBottom: "2rem" }}>${jsxText(subheadline)}</p>` : ""}
  ${ctaPrimary ? `<a href=${ctaHref} style={{ display: "inline-block", padding: "14px 32px", background: "#fff", color: "var(--primary)", borderRadius: "var(--radius)", fontWeight: 700, textDecoration: "none" }}>${jsxText(ctaPrimary)}</a>` : ""}
  ${visual ? `<div style={{ maxWidth: "960px", margin: "2.5rem auto 0" }}>${visual}</div>` : ""}`)}
</section>`;
    }

    case "FEATURES":
      return `
<section${citationAttr} style={{ padding: "80px 24px", maxWidth: "1100px", margin: "0 auto" }}>
  <h2 style={{ fontSize: "2rem", fontWeight: 700, textAlign: "center", marginBottom: "3rem" }}>${jsxText(headline)}</h2>
  <div style={{ ${ITEMS_GRID} }}>
    ${itemCards(items, itemMedia)}
  </div>
</section>`;

    case "CTA":
      return `
<section${citationAttr} style={{ ${layered}padding: "80px 24px", background: "var(--accent)", textAlign: "center" }}>
  ${background}${front(`
  <h2 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>${jsxText(headline)}</h2>
  ${body ? `<p style={{ marginBottom: "2rem", color: "#374151" }}>${jsxText(body)}</p>` : ""}
  ${ctaPrimary ? `<a href=${ctaHref} style={{ display: "inline-block", padding: "14px 32px", background: "var(--primary)", color: "#fff", borderRadius: "var(--radius)", fontWeight: 700, textDecoration: "none" }}>${jsxText(ctaPrimary)}</a>` : ""}`)}
</section>`;

    case "FOOTER":
      return `
<footer${citationAttr} style={{ padding: "2rem 24px", borderTop: "1px solid #e5e7eb", textAlign: "center", color: "#9ca3af", fontSize: ".85rem" }}>
  <p>${jsxText(headline || "© 2025 All rights reserved.")}</p>
</footer>`;

    default: {
      const logo = slotMarkup(media, section, "logo");
      const showcase = slotMarkup(media, section, "showcase");
      // Item cards appear only when an item has media, so media-less sections render as before.
      const cards = items.some((_, i) => hasBoundSlot(media?.ctx, media ? slotIdOf(media.pageSlug, section, `item-${i}`) : ""))
        ? `<div style={{ ${ITEMS_GRID}, marginTop: "2rem" }}>
    ${itemCards(items, itemMedia)}
  </div>`
        : "";
      return `
<section${citationAttr} style={{ ${layered}padding: "60px 24px", maxWidth: "${cards || showcase ? "1100px" : "900px"}", margin: "0 auto" }}>
  ${background}${front(`
  ${logo ? `<div style={{ marginBottom: "1rem" }}>${logo}</div>` : ""}<h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1rem" }}>${jsxText(headline)}</h2>
  ${body ? `<p style={{ color: "#374151" }}>${jsxText(body)}</p>` : ""}
  ${showcase ? `<div style={{ marginTop: "2rem" }}>${showcase}</div>` : ""}${cards}`)}
</section>`;
    }
  }
}

export function pageToComponent(
  page: SiteSpec["pages"][number],
  componentName: string,
  mediaCtx?: MediaRenderContext,
): string {
  const sections = page.sections
    .map((section) => sectionToJsx(section, mediaCtx ? { ctx: mediaCtx, pageSlug: page.slug } : undefined))
    .join("\n");
  return `export default function ${componentName}() {
  return (
    <main>
      ${sections}
    </main>
  )
}
`;
}

export function toRoutePath(slug: string): string {
  if (slug === "/" || slug === "" || slug === "home" || slug === "index")
    return "/";
  return `/${slug.replace(/^\/+/, "")}`;
}

export function toComponentName(slug: string, index: number): string {
  const cleaned = slug.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  const pascal = cleaned
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");
  return pascal || `Page${index}`;
}

export type PageMeta = {
  page: SiteSpec["pages"][number];
  componentName: string;
  routePath: string;
  fileName: string;
};

export function buildPageMeta(spec: SiteSpec): PageMeta[] {
  return spec.pages.map((page, i) => ({
    page,
    componentName: toComponentName(page.slug, i) + "Page",
    routePath: toRoutePath(page.slug),
    fileName: `${toComponentName(page.slug, i)}.jsx`,
  }));
}

export type MediaBuildOptions = {
  target: MediaTarget;
  // Already resolved for this target: preview variants carry signed URLs.
  assets: readonly ResolvedMediaAsset[];
  maxAutoplayVideosPerPage?: number;
};

export type BuildSiteOptions = { media?: MediaBuildOptions };

export type BuiltSite = {
  files: GeneratedFile[];
  mediaWarnings: string[];
  // Exactly the variant files the markup references (export target only).
  mediaFiles: MediaFileRef[];
};

const DEFAULT_MAX_AUTOPLAY_VIDEOS_PER_PAGE = 3;

export function buildSiteFiles(
  spec: SiteSpec,
  seoFiles?: SeoFiles,
  options?: BuildSiteOptions,
): GeneratedFile[] {
  return buildSite(spec, seoFiles, options).files;
}

/**
 * Produces the same Vite+React scaffold used for the live WebContainer
 * preview, as a flat file list — usable both by a FileSystemTree consumer
 * (web) and a real `vite build` run against files written to disk (worker).
 * Keeping this one shared implementation is what guarantees the deployed
 * site matches what the user approved in preview.
 */
export function buildSite(
  spec: SiteSpec,
  seoFiles?: SeoFiles,
  options?: BuildSiteOptions,
): BuiltSite {
  const homePage = spec.pages.find((p) => p.type === "HOME") ?? spec.pages[0]!;
  const pageMeta = buildPageMeta(spec);
  const isMultiPage = pageMeta.length > 1;
  const mediaCtx = createMediaContext(spec, options?.media?.target ?? "preview", options?.media?.assets ?? []);
  const hasMedia = Object.keys(spec.media ?? {}).length > 0;
  const maxAutoplay = options?.media?.maxAutoplayVideosPerPage ?? DEFAULT_MAX_AUTOPLAY_VIDEOS_PER_PAGE;
  const knownSlots = new Set(listMediaSlots(spec).map((ref) => ref.slotId));
  for (const slotId of Object.keys(spec.media ?? {})) {
    if (!knownSlots.has(slotId)) mediaCtx.warnings.push(`${slotId}: media dropped (unknown slot)`);
  }
  const renderPage = (page: SiteSpec["pages"][number], componentName: string) => {
    const before = mediaCtx.autoplayCount;
    const source = pageToComponent(page, componentName, hasMedia ? mediaCtx : undefined);
    if (mediaCtx.autoplayCount - before > maxAutoplay) {
      mediaCtx.warnings.push(`${page.slug}: more than ${maxAutoplay} autoplaying videos on one page`);
    }
    return source;
  };

  const indexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(homePage.seo?.title ?? homePage.title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(cssFontName(spec.designSystem.fontPrimary))}:wght@400;600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;

  const mediaImport = hasMedia ? `import "./mediaPlayback.js"\n\n` : "\n";

  const mainJsxSinglePage = `import { createRoot } from "react-dom/client"
import App from "./App"
import "./index.css"
import "./citationHover.js"
${mediaImport}createRoot(document.getElementById("root")).render(<App />)
`;

  const mainJsxMultiPage = `import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import "./index.css"
import "./citationHover.js"
${mediaImport}createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
`;

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
`;

  const appJsxSinglePage = isMultiPage ? "" : renderPage(homePage, "App");

  const appJsxMultiPage = `import { Routes, Route } from "react-router-dom"
${pageMeta.map((m) => `import ${m.componentName} from "./pages/${m.fileName.replace(".jsx", "")}"`).join("\n")}

export default function App() {
  return (
    <Routes>
      ${pageMeta.map((m) => `<Route path={${JSON.stringify(m.routePath)}} element={<${m.componentName} />} />`).join("\n      ")}
    </Routes>
  )
}
`;

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
    2,
  );

  const viteConfig = `import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: { host: true, strictPort: false },
})
`;

  const files: GeneratedFile[] = [
    { path: "package.json", content: packageJson },
    { path: "vite.config.js", content: viteConfig },
    { path: "index.html", content: indexHtml },
    {
      path: "src/main.jsx",
      content: isMultiPage ? mainJsxMultiPage : mainJsxSinglePage,
    },
    {
      path: "src/App.jsx",
      content: isMultiPage ? appJsxMultiPage : appJsxSinglePage,
    },
    { path: "src/index.css", content: cssVars(spec.designSystem) },
    { path: "src/citationHover.js", content: citationHoverJs },
  ];
  if (hasMedia) files.push({ path: "src/mediaPlayback.js", content: MEDIA_PLAYBACK_JS });

  if (isMultiPage) {
    for (const m of pageMeta) {
      files.push({
        path: `src/pages/${m.fileName}`,
        content: renderPage(m.page, m.componentName),
      });
    }
  }

  if (seoFiles?.robotsTxt) {
    files.push({ path: "public/robots.txt", content: seoFiles.robotsTxt });
  }
  if (seoFiles?.sitemapXml) {
    files.push({ path: "public/sitemap.xml", content: seoFiles.sitemapXml });
  }

  return { files, mediaWarnings: mediaCtx.warnings, mediaFiles: [...mediaCtx.files.values()] };
}

export { withScaffold, type ReplicationNextFile } from "./nextScaffold.js";
export {
  buildRobotsTxt,
  buildSitemapXml,
  validateKeywords,
  type KeywordValidationResult,
} from "./seoFiles.js";
export * from "./theme/tokens.js";
export * from "./capabilities.js";
export * from "./media.js";
