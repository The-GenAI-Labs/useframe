import { type ResolvedMediaAsset, type Section, type SiteSpec } from "@repo/schemas";
import {
  createMediaContext,
  listMediaSlots,
  MEDIA_PLAYBACK_JS,
  sectionIdOf,
  type MediaFileRef,
  type MediaRenderContext,
  type MediaTarget,
} from "./media.js";
import {
  contactMethods,
  defaultSiteContext,
  deriveBrand,
  navLabel,
  resolveVariants,
  sectionToJsx,
  siteHref,
  willRender,
  type Band,
  type SiteContext,
  type SiteLink,
} from "./sections.js";
import { SITE_UI_JS } from "./siteUi.js";
import { buildDesignSystemCss } from "./theme/css.js";
import { googleFontsHref, resolveTheme, type ResolvedTheme } from "./theme/theme.js";

export type SeoFiles = {
  robotsTxt?: string;
  sitemapXml?: string;
};

export type GeneratedFile = { path: string; content: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function cssVars(ds: SiteSpec["designSystem"]): string {
  return buildDesignSystemCss(resolveTheme({ designSystem: ds }));
}

type Page = SiteSpec["pages"][number];

function pageBands(sections: Section[]): Band[] {
  let n = 0;
  return sections.map((s) => {
    if (s.type === "STATS") return "tint";
    if (s.type === "HERO" || s.type === "LOGOS" || s.type === "CTA") return "base";
    return n++ % 2 === 0 ? "base" : "subtle";
  });
}

export function pageToComponent(page: Page, componentName: string, mediaCtx?: MediaRenderContext, site?: SiteContext): string {
  const ctx = site ?? defaultSiteContext();
  const media = mediaCtx ? { ctx: mediaCtx, pageSlug: page.slug } : undefined;
  const header = page.sections.find((s) => s.type === "HEADER");
  const footer = [...page.sections].reverse().find((s) => s.type === "FOOTER");
  const body = page.sections.filter((s) => s.type !== "HEADER" && s.type !== "FOOTER" && willRender(s));
  const variants = resolveVariants(body, ctx.preset);
  const bands = pageBands(body);
  const heroAt = body.findIndex((s) => s.type === "HERO");
  const h1At = heroAt >= 0 ? heroAt : body.findIndex((s) => s.type !== "LOGOS" && s.type !== "STATS");
  // Auto-inserted chrome has no slots of its own, so it never gets media.
  const chrome = (section: Section, real: boolean) =>
    sectionToJsx(section, real ? media : undefined, {
      site: ctx,
      variant: resolveVariants([section], ctx.preset)[0],
      headingLevel: 2,
    });
  const headerJsx = chrome(header ?? ctx.chrome?.header ?? { type: "HEADER", index: 0 }, !!header);
  const footerJsx = chrome(footer ?? ctx.chrome?.footer ?? { type: "FOOTER", index: page.sections.length }, !!footer);
  const sections = body
    .map((section, i) =>
      sectionToJsx(section, media, { site: ctx, variant: variants[i], band: bands[i], headingLevel: i === h1At ? 1 : 2 }),
    )
    .join("\n");
  const srTitle = h1At < 0 ? `<h1 className="sr-only">{${JSON.stringify(page.title)}}</h1>` : "";
  const imports = ctx.multiPage ? `import { Link } from "react-router-dom"\n\n` : "";
  return `${imports}export default function ${componentName}() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      ${headerJsx}
      <main id="main">
      ${srTitle}${sections}
      </main>
      ${footerJsx}
    </>
  )
}
`;
}

const anchor = (s: Section): SiteLink => ({ label: "", href: `#${sectionIdOf(s)}`, route: false });
const SHORT_LABEL = 28;

function primaryCtaFor(page: Page): SiteLink | undefined {
  const target = page.sections.find((s) => (s.type === "CTA" || s.type === "PRICING" || s.type === "CONTACT") && willRender(s));
  for (const type of ["HERO", "CTA"] as const) {
    const cta = page.sections.find((s) => s.type === type && s.content?.cta?.primary?.trim())?.content?.cta;
    if (cta?.primary) {
      return { label: cta.primary, href: siteHref(cta.primaryHref) ?? (target ? anchor(target).href : "#main"), route: false };
    }
  }
  return undefined;
}

export function buildSiteContext(spec: SiteSpec, pageMeta: PageMeta[], theme: ResolvedTheme, page: Page): SiteContext {
  const multiPage = pageMeta.length > 1;
  const nav: SiteLink[] = multiPage
    ? pageMeta.slice(0, 6).map((m) => ({ label: m.page.title, href: m.routePath, route: true }))
    : page.sections
        .filter((s) => willRender(s) && navLabel(s))
        .map((s) => ({ ...anchor(s), label: navLabel(s)! }))
        .filter((l, i, all) => all.findIndex((o) => o.label === l.label) === i)
        .slice(0, 5);
  const home = pageMeta.find((m) => m.routePath === "/")?.page ?? spec.pages[0]!;
  const learnMore = page.sections.find((s) => (s.type === "FEATURES" || s.type === "HOW_IT_WORKS") && willRender(s));
  const featureSource = [page, home]
    .flatMap((p) => p.sections)
    .find((s) => s.type === "FEATURES" && (s.content?.items?.length ?? 0) > 0);
  const featureLabels = (featureSource?.content?.items ?? [])
    .map((i) => i.title.trim())
    .filter((t) => t && t.length <= SHORT_LABEL)
    .slice(0, 4);
  const contactLinks = spec.pages
    .flatMap((p) => p.sections)
    .filter((s) => s.type === "CONTACT")
    .flatMap((s) => contactMethods(s.content ?? {}))
    .filter((m): m is typeof m & { href: string } => !!m.href)
    .slice(0, 3)
    .map((m) => ({ label: /^(mailto|tel):/.test(m.href) ? m.value : m.label, href: m.href, route: false }));
  const heroSub = home.sections.find((s) => s.type === "HERO")?.content?.subheadline?.trim();
  return {
    brand: deriveBrand(spec),
    tagline: heroSub && heroSub.length <= 140 ? heroSub : undefined,
    year: new Date().getFullYear(),
    multiPage,
    preset: theme.preset,
    nav,
    primaryCta: primaryCtaFor(page) ?? (page === home ? undefined : primaryCtaFor(home)),
    secondaryHref: learnMore ? anchor(learnMore).href : "#main",
    featureLabels,
    contactLinks,
    chrome: {
      header: home.sections.find((s) => s.type === "HEADER"),
      footer: [...home.sections].reverse().find((s) => s.type === "FOOTER"),
    },
  };
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
  const theme = resolveTheme(spec);
  const renderPage = (page: SiteSpec["pages"][number], componentName: string) => {
    const before = mediaCtx.autoplayCount;
    const site = buildSiteContext(spec, pageMeta, theme, page);
    const source = pageToComponent(page, componentName, hasMedia ? mediaCtx : undefined, site);
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
    <meta name="theme-color" content="${theme.palette.bg}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${escapeHtml(googleFontsHref(theme))}" rel="stylesheet" />
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
import "./siteUi.js"
${mediaImport}createRoot(document.getElementById("root")).render(<App />)
`;

  const mainJsxMultiPage = `import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import App from "./App"
import "./index.css"
import "./citationHover.js"
import "./siteUi.js"
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
    { path: "src/index.css", content: buildDesignSystemCss(theme) },
    { path: "src/citationHover.js", content: citationHoverJs },
    { path: "src/siteUi.js", content: SITE_UI_JS },
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
export { cssFontName, PRESETS, resolveTheme, googleFontsHref, type ResolvedTheme } from "./theme/theme.js";
export { buildPalette, contrastPairs, type Palette } from "./theme/palette.js";
export { contrastRatio } from "./theme/color.js";
export { buildDesignSystemCss } from "./theme/css.js";
export { ICONS, iconSvg, resolveIconName } from "./icons.js";
export {
  sectionToJsx,
  resolveVariants,
  willRender,
  deriveBrand,
  type SectionMedia,
  type SectionRenderOptions,
  type SiteContext,
} from "./sections.js";
export * from "./capabilities.js";
export * from "./media.js";
