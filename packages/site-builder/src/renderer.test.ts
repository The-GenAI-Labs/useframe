import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";
import {
  SECTION_VARIANTS,
  SiteSpecSchema,
  THEME_PRESETS,
  type ResolvedMediaAsset,
  type Section,
  type SectionType,
  type SiteSpec,
} from "@repo/schemas";
import { fixtures } from "../gallery/fixtures.js";
import { buildSite, buildSiteFiles } from "./index.js";
import { contrastPairs, buildPalette } from "./theme/palette.js";
import { contrastRatio } from "./theme/color.js";
import { resolveTheme } from "./theme/theme.js";
import { resolveVariants } from "./sections.js";

const tmpDir = join(process.cwd(), "src", ".render-tmp");
let counter = 0;

beforeAll(() => {
  mkdirSync(tmpDir, { recursive: true });
  (globalThis as Record<string, unknown>).React = React;
});
afterAll(() => rmSync(tmpDir, { recursive: true, force: true }));

async function renderJsx(source: string, multiPage = false): Promise<string> {
  const file = join(tmpDir, `c${counter++}.jsx`);
  writeFileSync(file, `import * as React from "react"\n${source}`);
  const mod = (await import(/* @vite-ignore */ file)) as { default: React.ComponentType };
  const el = React.createElement(mod.default);
  return renderToStaticMarkup(multiPage ? React.createElement(StaticRouter, { location: "/" }, el) : el);
}

async function renderSpec(spec: SiteSpec, assets: ResolvedMediaAsset[] = []): Promise<{ pages: string[]; css: string; html: string; warnings: string[] }> {
  const built = buildSite(spec, undefined, { media: { target: "preview", assets } });
  const pageFiles = built.files.filter((f) => f.path.startsWith("src/pages/"));
  const sources = pageFiles.length ? pageFiles : built.files.filter((f) => f.path === "src/App.jsx");
  const pages = await Promise.all(sources.map((f) => renderJsx(f.content, pageFiles.length > 0)));
  return {
    pages,
    css: built.files.find((f) => f.path === "src/index.css")!.content,
    html: built.files.find((f) => f.path === "index.html")!.content,
    warnings: built.mediaWarnings,
  };
}

const designSystem: SiteSpec["designSystem"] = {
  primaryColor: "#2563EB",
  secondaryColor: "#F1F5F9",
  accentColor: "#F97316",
  fontPrimary: "Inter",
  fontSecondary: "Lora",
  spacing: "comfortable",
  borderRadius: "md",
  animationStyle: "subtle",
};

const full = (type: SectionType): NonNullable<Section["content"]> => ({
  eyebrow: `${type} eyebrow`,
  headline: `${type} headline`,
  subheadline: `${type} sub`,
  body: `${type} body`,
  cta: { primary: `${type} go`, primaryHref: "https://example.com/go", secondary: `${type} more` },
  items: [0, 1, 2, 3].map((i) => ({ title: `${type} item ${i}`, description: `${type} detail ${i}` })),
  stats: [{ value: "12k", label: `${type} stat` }],
  plans: [{ name: `${type} plan`, price: "$9", period: "/mo", features: [`${type} feature`], highlighted: true }],
  logos: [{ name: `${type} logo` }],
  links: [{ label: `${type} link`, href: "https://example.com/legal" }],
});

const pageSpec = (sections: Section[], extra: Partial<SiteSpec> = {}): SiteSpec => ({
  siteType: "SINGLE_PAGE",
  copyFramework: "AIDA",
  citations: [],
  designSystem,
  pages: [{ type: "HOME", slug: "home", title: "Home", seo: { title: "Acme — Things", description: "d" }, sections }],
  ...extra,
});

const h1Count = (html: string) => (html.match(/<h1[\s>]/g) ?? []).length;

describe("section variants", () => {
  const cases = (Object.entries(SECTION_VARIANTS) as [SectionType, readonly string[]][]).flatMap(([type, variants]) =>
    variants.map((variant) => [type, variant] as const),
  );

  it.each(cases)("%s / %s renders every item with content and stays valid without it", async (type, variant) => {
    const withContent = await renderSpec(pageSpec([{ type, index: 0, variant: variant as Section["variant"], content: full(type) }]));
    const html = withContent.pages[0]!;
    expect(h1Count(html)).toBe(1);
    if (type === "STATS") expect(html).toContain(`${type} stat`);
    else if (type === "LOGOS") expect(html).toContain(`${type} logo`);
    else if (type === "PRICING") expect(html).toContain(`${type} plan`);
    else if (type !== "HEADER" && type !== "FOOTER") {
      expect(html).toContain(`${type} headline`);
      for (let i = 0; i < 4; i++) expect(html).toContain(`${type} item ${i}`);
    }
    const empty = await renderSpec(pageSpec([{ type, index: 0, variant: variant as Section["variant"] }]));
    expect(h1Count(empty.pages[0]!)).toBe(1);
    expect(empty.pages[0]).toContain("<header");
    expect(empty.pages[0]).toContain("<footer");
  });

  it("renders proof sections only when they have facts", async () => {
    const { pages } = await renderSpec(
      pageSpec(["TESTIMONIALS", "PRICING", "TEAM", "STATS", "LOGOS"].map((type, index) => ({ type: type as SectionType, index, content: { headline: `${type} headline` } }))),
    );
    for (const type of ["TESTIMONIALS", "PRICING", "TEAM", "STATS", "LOGOS"]) expect(pages[0]).not.toContain(`${type} headline`);
  });

  it("keeps legacy pricing and testimonial items instead of dropping them", async () => {
    const { pages } = await renderSpec(
      pageSpec([
        { type: "PRICING", index: 0, content: { headline: "Pricing", items: [{ title: "Pro — USD 49/month", description: "A · B · C" }] } },
        { type: "TESTIMONIALS", index: 1, content: { items: [{ title: "Ana Lee, CTO, Acme", description: "“Great tool.”" }] } },
        { type: "FAQ", index: 2, content: { items: [{ title: "Why?", description: "Because answers matter." }] } },
      ]),
    );
    expect(pages[0]).toContain("USD 49");
    expect(pages[0]).toContain("/month");
    for (const text of ["Pro", ">A<", ">C<", "Ana Lee", "CTO, Acme", "Great tool.", "Because answers matter."]) expect(pages[0]).toContain(text);
  });

  it("chooses variants deterministically and steps through them for repeated types", () => {
    const sections: Section[] = [
      { type: "FEATURES", index: 0, content: { items: [1, 2, 3].map((i) => ({ title: `t${i}`, description: "d" })) } },
      { type: "FEATURES", index: 1, content: { items: [1, 2, 3].map((i) => ({ title: `t${i}`, description: "d" })) } },
    ];
    const a = resolveVariants(sections, "minimal");
    expect(a).toEqual(resolveVariants(sections, "minimal"));
    expect(a[0]).not.toBe(a[1]);
    expect(resolveVariants([{ ...sections[0]!, variant: "list" }], "bold")).toEqual(["list"]);
  });

  it("falls back to the default for unknown or mismatched variants", () => {
    const parsed = SiteSpecSchema.parse(pageSpec([{ type: "HERO", index: 0, variant: "bogus" as Section["variant"] }]));
    expect(parsed.pages[0]!.sections[0]!.variant).toBeUndefined();
    expect(resolveVariants([{ type: "PRICING", index: 0, variant: "bento" }], "minimal")).toEqual(["tiers"]);
  });
});

describe("page chrome", () => {
  it("auto-inserts a header with anchors and a footer with the current year", async () => {
    const spec = pageSpec([
      { type: "HERO", index: 0, content: { headline: "Hi", cta: { primary: "Start" } } },
      { type: "FEATURES", index: 1, content: { items: [{ title: "a", description: "b" }] } },
      { type: "FOOTER", index: 2, content: { headline: "© 2025 Acme Inc. All rights reserved." } },
    ]);
    const { pages } = await renderSpec(spec);
    const html = pages[0]!;
    expect(html).toContain(`href="#features-1"`);
    expect(html).toContain(`aria-expanded="false"`);
    expect(html).toContain(`© ${new Date().getFullYear()} Acme Inc`);
    expect(html).not.toContain("2025");
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("<footer")).toBeGreaterThan(html.indexOf("</main>"));
    expect(html).toContain(`class="skip-link" href="#main"`);
  });

  it("keeps programmatic scrolling instant and brand initials alphanumeric", async () => {
    const { pages, css } = await renderSpec(pageSpec([{ type: "HERO", index: 0, content: { headline: "Hi" } }], { pages: [{ type: "HOME", slug: "home", title: "[beta] Acme", sections: [{ type: "HERO", index: 0 }] }] }));
    // Smooth scrolling is opt-in for visitors only, so automated full-page captures are not mid-animation.
    expect(css).not.toMatch(/(^|[\s}])html\s*\{\s*scroll-behavior/);
    expect(css).toContain("html.uf-motion { scroll-behavior: smooth; }");
    expect(pages[0]).toContain(`<span class="brand-mark" aria-hidden="true">B</span>`);
  });

  it("links pages in multi-page sites and reuses the home footer", async () => {
    const [, , , , , fintech] = fixtures();
    const { pages } = await renderSpec(fintech!.spec);
    expect(pages).toHaveLength(2);
    for (const html of pages) {
      expect(html).toContain(`href="/pricing"`);
      expect(h1Count(html)).toBe(1);
      expect(html).toContain("Banking for the self-employed.");
    }
  });

  it("loads both fonts and applies the theme tokens", async () => {
    const { html, css } = await renderSpec(pageSpec([{ type: "HERO", index: 0 }], { theme: { preset: "bold", radius: "pill" } }));
    expect(html).toContain("family=Inter:wght@400;500;600;700");
    expect(html).toContain("family=Lora:wght@400;500;600;700");
    expect(html).toContain("display=swap");
    expect(css).toContain("--radius-btn: 999px");
    expect(css).toContain(`--font-body: "Lora", Georgia`);
    expect(css).not.toMatch(/#111\b/);
  });

  it("uses the brief's body size and touch target, never below the floor", () => {
    const brief = (minSize: string, touchTarget: string) =>
      ({ typography: { minSize }, accessibility: { touchTarget } }) as unknown as SiteSpec["designBrief"];
    expect(resolveTheme({ designSystem, designBrief: brief("19px", "48px") })).toMatchObject({ bodyPx: 19, touchPx: 48 });
    expect(resolveTheme({ designSystem, designBrief: brief("12px", "20px") })).toMatchObject({ bodyPx: 16, touchPx: 44 });
    expect(resolveTheme({ designSystem })).toMatchObject({ bodyPx: 17, touchPx: 44 });
  });
});

describe("contrast", () => {
  const colors = ["#2563EB", "#FACC15", "#F97316", "#111111", "#FFFFFF", "#10B981", "#E11D48", "#7C3AED", "#94A3B8", "not-a-colour"];
  it.each(THEME_PRESETS.flatMap((preset) => (["light", "dark"] as const).map((mode) => [preset, mode] as const)))(
    "%s / %s passes WCAG AA for every text pair",
    (preset, mode) => {
      for (const primary of colors) {
        for (const accent of colors) {
          const theme = resolveTheme({ designSystem: { ...designSystem, primaryColor: primary, accentColor: accent }, theme: { preset, colorMode: mode } });
          for (const pair of contrastPairs(theme.palette)) {
            expect(contrastRatio(pair.fg, pair.bg), `${primary}/${accent} ${pair.name}`).toBeGreaterThanOrEqual(pair.min);
          }
        }
      }
    },
  );

  it("darkens a brand colour that fails as a button background", () => {
    const pal = buildPalette({ primary: "#60A5FA" }, "light", "balanced");
    expect(contrastRatio(pal.primary, pal.onPrimary)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("backward compatibility", () => {
  it("renders a legacy spec with no theme, variants or new fields", async () => {
    const legacy = pageSpec(
      (["HEADER", "HERO", "FEATURES", "HOW_IT_WORKS", "TESTIMONIALS", "PRICING", "CTA", "FAQ", "TEAM", "CONTACT", "CUSTOM", "FOOTER"] as const).map(
        (type, index) => ({ type, index, content: { headline: `${type} headline`, body: "Body", items: [{ title: "x", description: "y" }] }, citationIds: ["c1"] }),
      ),
      { designSystem: { ...designSystem, borderRadius: "lg", spacing: "compact" } },
    );
    expect(SiteSpecSchema.safeParse(legacy).success).toBe(true);
    const { pages, css } = await renderSpec(legacy);
    expect(h1Count(pages[0]!)).toBe(1);
    expect(pages[0]).toContain(`data-citation-ids="[&quot;c1&quot;]"`);
    expect(css).toContain("--radius-btn: 14px");
    expect(css).toContain("--density: 0.85");
  });

  it("keeps the generated site's dependencies and scripts unchanged", () => {
    const files = buildSiteFiles(pageSpec([{ type: "HERO", index: 0 }]));
    expect(JSON.parse(files.find((f) => f.path === "package.json")!.content)).toEqual({
      name: "preview",
      private: true,
      type: "module",
      scripts: { dev: "vite --host", build: "vite build" },
      dependencies: { react: "18.3.1", "react-dom": "18.3.1" },
      devDependencies: { vite: "5.4.0", "@vitejs/plugin-react": "4.3.1" },
    });
    const main = files.find((f) => f.path === "src/main.jsx")!.content;
    expect(main).toContain(`import "./citationHover.js"`);
    expect(main).toContain(`import "./siteUi.js"`);
    expect(files.find((f) => f.path === "src/siteUi.js")!.content).toContain("prefers-reduced-motion: reduce");
  });

  it("renders every gallery fixture without media warnings", async () => {
    for (const fx of fixtures()) {
      const { pages, warnings } = await renderSpec(fx.spec, fx.assets);
      expect(warnings, fx.name).toEqual([]);
      for (const html of pages) expect(h1Count(html), fx.name).toBe(1);
    }
  });
});

describe("escaping", () => {
  const evil = `<script>alert(1)</script> "><img src=x onerror=alert(1)> {globalThis.__pwned = true}`;
  it("renders hostile text in every new field as inert text and drops unsafe hrefs", async () => {
    const hostile = (type: SectionType): Section => ({
      type,
      index: 0,
      content: {
        eyebrow: evil,
        headline: evil,
        cta: { primary: evil, primaryHref: "javascript:alert(1)", secondary: evil, secondaryHref: "data:text/html,x" },
        items: [{ title: evil, description: evil, icon: evil, meta: evil, author: evil, role: evil, company: evil }],
        stats: [{ value: evil, label: evil }],
        plans: [{ name: evil, price: evil, period: evil, description: evil, features: [evil], cta: evil, ctaHref: "javascript:alert(1)" }],
        logos: [{ name: evil }],
        links: [{ label: evil, href: "javascript:alert(1)" }, { label: evil, href: "//evil.example.com" }],
      },
    });
    const types = Object.keys(SECTION_VARIANTS) as SectionType[];
    const { pages } = await renderSpec(pageSpec(types.map((t, i) => ({ ...hostile(t), index: i })), { designSystem: { ...designSystem, fontPrimary: evil } }));
    const html = pages[0]!;
    expect((globalThis as Record<string, unknown>).__pwned).toBeUndefined();
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i);
    for (const [, href] of html.matchAll(/href="([^"]*)"/g)) expect(href).not.toMatch(/^\s*(javascript|data|vbscript):|^\/\//i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
