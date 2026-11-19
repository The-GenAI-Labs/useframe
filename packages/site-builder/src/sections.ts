import { safeHref, SECTION_VARIANTS, type Section, type SectionType, type SiteSpec, type ThemePreset } from "@repo/schemas";
import { iconSvg, inferIconName, resolveIconName } from "./icons.js";
import { renderSlotMedia, sectionIdOf, slotIdOf, slotsForSection, type MediaRenderContext } from "./media.js";

export type SectionMedia = { ctx: MediaRenderContext; pageSlug: string };
export type Band = "base" | "subtle" | "tint";
export type SiteLink = { label: string; href: string; route: boolean };

export type SiteContext = {
  brand: string;
  tagline?: string;
  year: number;
  multiPage: boolean;
  preset: ThemePreset;
  nav: SiteLink[];
  primaryCta?: SiteLink;
  secondaryHref: string;
  featureLabels: string[];
  contactLinks: SiteLink[];
  // The home page's own header/footer, reused by pages that have none.
  chrome?: { header?: Section; footer?: Section };
};

export type SectionRenderOptions = {
  headingLevel: 1 | 2;
  band: Band;
  variant?: string;
  site: SiteContext;
};

type Content = NonNullable<Section["content"]>;
type Item = NonNullable<Content["items"]>[number];

// User- and model-supplied strings reach generated source code, so every
// value is emitted as a JS string literal inside a JSX expression (React then
// escapes it as text) and every href goes through siteHref.
export function jsxText(value: unknown): string {
  return `{${JSON.stringify(typeof value === "string" ? value : "")}}`;
}

const INTERNAL_PATH = /^\/(?!\/)[A-Za-z0-9._~\-/]*(#[A-Za-z0-9_-]*)?$/;

export function siteHref(value: unknown): string | null {
  const safe = safeHref(value);
  if (safe) return safe;
  return typeof value === "string" && INTERNAL_PATH.test(value.trim()) ? value.trim() : null;
}

const str = (value: string) => `{${JSON.stringify(value)}}`;
const has = (value: string | undefined): value is string => typeof value === "string" && value.trim().length > 0;

export const SECTION_LABELS: Record<SectionType, string> = {
  HERO: "Home",
  FEATURES: "Features",
  HOW_IT_WORKS: "How it works",
  TESTIMONIALS: "Testimonials",
  PRICING: "Pricing",
  CTA: "Get started",
  FAQ: "FAQ",
  TEAM: "Team",
  CONTACT: "Contact",
  HEADER: "Header",
  FOOTER: "Footer",
  CUSTOM: "About",
  STATS: "Key figures",
  LOGOS: "Trusted by",
};

const NAV_TYPES: SectionType[] = ["FEATURES", "HOW_IT_WORKS", "PRICING", "TESTIMONIALS", "FAQ", "TEAM", "CONTACT", "CUSTOM"];

const PRESET_DEFAULTS: Record<ThemePreset, Partial<Record<SectionType, string>>> = {
  minimal: {},
  editorial: { HERO: "editorial", FEATURES: "list", HOW_IT_WORKS: "timeline", TESTIMONIALS: "featured", FAQ: "two-column", CTA: "split", HEADER: "centered" },
  bold: { HERO: "centered", FEATURES: "bento", STATS: "cards", TESTIMONIALS: "featured" },
  soft: { HERO: "centered", FEATURES: "grid", STATS: "cards" },
  tech: { HERO: "split", FEATURES: "bento", STATS: "cards" },
  warm: { HERO: "split", FEATURES: "alternating", HOW_IT_WORKS: "timeline", TESTIMONIALS: "featured" },
};

function variantsOf(type: SectionType): readonly string[] {
  return (SECTION_VARIANTS as Record<string, readonly string[]>)[type] ?? [];
}

function fitsDefault(section: Section, variant: string): boolean {
  const n = section.content?.items?.length ?? 0;
  if (variant === "alternating") return n > 0 && n <= 4;
  if (variant === "bento") return n >= 3;
  return true;
}

// Deterministic: same sections + preset give the same layouts, and repeated
// types on one page step through their variants instead of repeating one.
export function resolveVariants(sections: Section[], preset: ThemePreset): string[] {
  const seen: Partial<Record<SectionType, number>> = {};
  return sections.map((section) => {
    const list = variantsOf(section.type);
    const k = seen[section.type] ?? 0;
    seen[section.type] = k + 1;
    if (section.variant && list.includes(section.variant)) return section.variant;
    if (list.length === 0) return "";
    const preferred = PRESET_DEFAULTS[preset][section.type] ?? list[0]!;
    const start = Math.max(0, list.indexOf(preferred));
    for (let i = 0; i < list.length; i++) {
      const candidate = list[(start + k + i) % list.length]!;
      if (fitsDefault(section, candidate)) return candidate;
    }
    return list[0]!;
  });
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function initials(name: string): string {
  const letters = name
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("");
  return letters.toUpperCase() || "•";
}

export function plansOf(c: Content): NonNullable<Content["plans"]> {
  if (c.plans && c.plans.length > 0) return c.plans;
  return (c.items ?? []).map((item) => {
    const [name, priceText] = item.title.split(/\s+[—–]\s+|\s+-\s+/);
    const m = /^(.*?)(\s*\/\s*[A-Za-z ]+)$/.exec(priceText ?? "");
    const features = item.description.includes("·") ? item.description.split(/\s*·\s*/).filter(Boolean) : [];
    return {
      name: name ?? item.title,
      price: m ? m[1]!.trim() : priceText,
      period: m ? m[2]!.trim() : undefined,
      description: features.length ? undefined : item.description,
      features,
    };
  });
}

function statsOf(c: Content): { value: string; label: string }[] {
  if (c.stats && c.stats.length > 0) return c.stats;
  return (c.items ?? []).map((i) => ({ value: i.title, label: i.description }));
}

function logosOf(c: Content): string[] {
  if (c.logos && c.logos.length > 0) return c.logos.map((l) => l.name).filter(has);
  return (c.items ?? []).map((i) => i.title).filter(has);
}

// Sections that need facts render nothing without them rather than an empty shell.
export function willRender(section: Section): boolean {
  const c = section.content ?? {};
  switch (section.type) {
    case "TESTIMONIALS":
    case "TEAM":
      return (c.items?.length ?? 0) > 0;
    case "PRICING":
      return plansOf(c).length > 0;
    case "STATS":
      return statsOf(c).length > 0;
    case "LOGOS":
      return logosOf(c).length > 0;
    default:
      return true;
  }
}

export function navLabel(section: Section): string | null {
  if (!NAV_TYPES.includes(section.type)) return null;
  if (section.type === "CUSTOM") {
    const h = section.content?.headline?.trim() ?? "";
    return h && h.split(/\s+/).length <= 3 && h.length <= 24 ? h : null;
  }
  return SECTION_LABELS[section.type];
}

function link(site: SiteContext, target: SiteLink, className: string, inner: string, extra = ""): string {
  const cls = className ? ` className="${className}"` : "";
  if (site.multiPage && target.route) return `<Link to=${str(target.href)}${cls}${extra}>${inner}</Link>`;
  return `<a href=${str(target.href)}${cls}${extra}>${inner}</a>`;
}

const icon = (name: string, cls = "icon") => iconSvg(name, cls);
const arrow = () => icon("arrow-right");

function itemIcon(item: Item, index: number): string {
  return resolveIconName(item.icon) ?? inferIconName(`${item.title} ${item.description}`, index);
}

function ctaButtons(
  c: Content,
  o: SectionRenderOptions,
  opts: { size?: "lg"; secondaryClass?: string; fallbackPrimary?: boolean } = {},
): string {
  const size = opts.size === "lg" ? " btn-lg" : "";
  const primaryLabel = has(c.cta?.primary) ? c.cta!.primary : opts.fallbackPrimary ? o.site.primaryCta?.label : undefined;
  const primaryHref = has(c.cta?.primary)
    ? siteHref(c.cta?.primaryHref) ?? o.site.primaryCta?.href ?? "#main"
    : o.site.primaryCta?.href ?? "#main";
  const buttons: string[] = [];
  if (has(primaryLabel)) {
    buttons.push(`<a className="btn btn-primary${size}" href=${str(primaryHref)}>${jsxText(primaryLabel)}${arrow()}</a>`);
  }
  if (has(c.cta?.secondary)) {
    const href = siteHref(c.cta?.secondaryHref) ?? o.site.secondaryHref;
    buttons.push(`<a className="btn ${opts.secondaryClass ?? "btn-secondary"}${size}" href=${str(href)}>${jsxText(c.cta!.secondary)}</a>`);
  }
  return buttons.join("\n          ");
}

type Ctx = {
  section: Section;
  c: Content;
  o: SectionRenderOptions;
  id: string;
  titleId: string;
  media?: SectionMedia;
  citationAttr: string;
};

function slot(ctx: Ctx, key: string): string {
  if (!ctx.media) return "";
  const def = slotsForSection(ctx.section).find((s) => s.key === key);
  return def ? renderSlotMedia(ctx.media.ctx, slotIdOf(ctx.media.pageSlug, ctx.section, key), def) : "";
}

function overlayOf(ctx: Ctx, key: string): "dark" | "light" {
  if (!ctx.media) return "dark";
  const binding = ctx.media.ctx.bindings[slotIdOf(ctx.media.pageSlug, ctx.section, key)];
  const def = slotsForSection(ctx.section).find((s) => s.key === key);
  return (binding?.overlay ?? def?.defaultOverlay) === "light" ? "light" : "dark";
}

function headingTag(ctx: Ctx): "h1" | "h2" {
  return ctx.o.headingLevel === 1 ? "h1" : "h2";
}

function title(ctx: Ctx, cls: string, fallback?: string): string {
  const H = headingTag(ctx);
  const text = has(ctx.c.headline) ? ctx.c.headline : fallback ?? SECTION_LABELS[ctx.section.type];
  return `<${H} id="${ctx.titleId}" className="${cls}">${jsxText(text)}</${H}>`;
}

function eyebrow(c: Content): string {
  return has(c.eyebrow) ? `<p className="eyebrow">${jsxText(c.eyebrow)}</p>` : "";
}

function intro(c: Content, leadClass = "lead"): string {
  const parts: string[] = [];
  if (has(c.subheadline)) parts.push(`<p className="${leadClass}">${jsxText(c.subheadline)}</p>`);
  if (has(c.body)) parts.push(`<p className="${parts.length ? "body" : leadClass}">${jsxText(c.body)}</p>`);
  return parts.join("\n        ");
}

function sectionHead(ctx: Ctx, opts: { left?: boolean } = {}): string {
  return `<div className="sec-head${opts.left ? " is-left" : ""}" data-reveal>
        ${eyebrow(ctx.c)}${title(ctx, "h2")}
        ${intro(ctx.c)}
      </div>`;
}

function open(ctx: Ctx, cls: string, labelled = true): string {
  const aria = labelled ? ` aria-labelledby="${ctx.titleId}"` : "";
  return `<section id="${ctx.id}" className="${cls}"${aria}${ctx.citationAttr}>`;
}

const bandClass = (o: SectionRenderOptions) => `band-${o.band}`;

function productVisual(site: SiteContext, labels: string[]): string {
  const seed = seedOf(site.brand + labels.join("|"));
  const bars = Array.from({ length: 9 }, (_, i) => 32 + ((seed >>> (i * 3)) % 60));
  const shown = (labels.length ? labels : ["Overview", "Activity", "Insights"]).slice(0, 3);
  const kpis = shown
    .map(
      (label, i) =>
        `<div className="vp-kpi"><span className="vp-kpi-label">${jsxText(label)}</span><span className="vp-kpi-bar" style={{ width: "${40 + ((seed >>> (i * 5)) % 55)}%" }} /></div>`,
    )
    .join("");
  const list = shown.map((label) => `<li>${icon("check")}<span>${jsxText(label)}</span></li>`).join("");
  return `<div className="visual visual-product" aria-hidden="true">
          <div className="vp-glow" />
          <div className="vp-window">
            <div className="vp-bar"><span /><span /><span /><span className="vp-title">${jsxText(site.brand)}</span></div>
            <div className="vp-body">
              <div className="vp-side"><span className="is-active" /><span /><span /><span /><span /></div>
              <div className="vp-main">
                <div className="vp-kpis">${kpis}</div>
                <div className="vp-chart">${bars.map((h) => `<span style={{ height: "${h}%" }} />`).join("")}</div>
                <ul className="vp-list">${list}</ul>
              </div>
            </div>
          </div>
          <div className="vp-float"><span className="icon-tile">${icon("sparkles")}</span><span>${jsxText(shown[0]!)}</span></div>
        </div>`;
}

function meshVisual(iconName: string): string {
  return `<div className="visual visual-mesh" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /><div className="mesh-icon"><span className="icon-tile">${icon(iconName)}</span></div></div>`;
}

function panelVisual(item: Item, iconName: string): string {
  return `<div className="visual visual-panel" aria-hidden="true"><div className="vpanel-card"><span className="icon-tile">${icon(iconName)}</span><strong>${jsxText(item.title)}</strong><div className="vpanel-lines"><span /><span /><span /></div></div></div>`;
}

function trustRow(c: Content): string {
  const stats = (c.stats ?? []).filter((s) => has(s.value)).slice(0, 4);
  const logos = (c.logos ?? []).map((l) => l.name).filter(has).slice(0, 6);
  if (!stats.length && !logos.length) return "";
  const parts = [
    ...stats.map((s) => `<div className="trust-stat"><strong>${jsxText(s.value)}</strong><span>${jsxText(s.label)}</span></div>`),
    ...logos.map((name) => `<span className="trust-logo">${jsxText(name)}</span>`),
  ];
  return `<div className="trust">${parts.join("")}</div>`;
}

function tagRow(labels: string[], icons: string[]): string {
  if (!labels.length) return "";
  return `<div className="hero-tags" aria-label="Highlights">${labels.map((label, i) => `<span className="tag">${icon(icons[i]!)}${jsxText(label)}</span>`).join("")}</div>`;
}

function renderHero(ctx: Ctx): string {
  const { c, o } = ctx;
  const background = slot(ctx, "background");
  const visualMedia = slot(ctx, "visual");
  const variant = background ? "media" : o.variant ?? "centered";
  const heading = title(ctx, "h1", o.site.brand);
  const lead = intro(c);
  const ctas = ctaButtons(c, o, { size: "lg", fallbackPrimary: true, secondaryClass: variant === "media" ? "btn-ghost-ink" : "btn-secondary" });
  const visual = visualMedia
    ? `<div className="hero-visual media-frame" data-reveal>${visualMedia}</div>`
    : `<div className="hero-visual" data-reveal>${productVisual(o.site, o.site.featureLabels)}</div>`;
  const items = c.items ?? [];
  const trust = trustRow(c) + tagRow(items.map((i) => i.title), items.map((item, i) => itemIcon(item, i)));

  if (variant === "media") {
    const tone = background && overlayOf(ctx, "background") === "light" ? "on-light" : "on-ink";
    return `
${open(ctx, `hero hero-media ${tone}`)}
      ${background || `<div className="ink-mesh" aria-hidden="true" />`}<div className="hero-scrim" aria-hidden="true" />
      <div className="container layer-front">
        <div data-reveal>
          ${eyebrow(c)}${heading}
          ${lead}
          ${ctas ? `<div className="btn-row">${ctas}</div>` : ""}
          ${trust}
        </div>
        ${visualMedia ? `<div className="hero-visual media-frame" style={{ marginTop: "3rem" }}>${visualMedia}</div>` : ""}
      </div>
    </section>`;
  }

  if (variant === "split") {
    return `
${open(ctx, "hero hero-split")}
      <div className="hero-backdrop" aria-hidden="true" />
      <div className="container hero-grid">
        <div data-reveal>
          ${eyebrow(c)}${heading}
          ${lead}
          ${ctas ? `<div className="btn-row">${ctas}</div>` : ""}
          ${trust}
        </div>
        ${visual}
      </div>
    </section>`;
  }

  if (variant === "editorial") {
    const tags = items.length ? "" : tagRow(o.site.featureLabels.slice(0, 4), o.site.featureLabels.map((l, i) => inferIconName(l, i)));
    return `
${open(ctx, "hero hero-editorial")}
      <div className="container">
        <div data-reveal>
          ${eyebrow(c)}${heading}
        </div>
        <div className="hero-rule" data-reveal>
          <div>${lead}</div>
          ${ctas ? `<div className="btn-row">${ctas}</div>` : "<div />"}
        </div>
        ${trust}
        ${visualMedia ? `<div className="hero-visual media-frame" data-reveal>${visualMedia}</div>` : tags}
      </div>
    </section>`;
  }

  return `
${open(ctx, "hero hero-centered")}
      <div className="hero-backdrop" aria-hidden="true" />
      <div className="container">
        <div data-reveal>
          ${eyebrow(c)}${heading}
          ${lead}
          ${ctas ? `<div className="btn-row is-center">${ctas}</div>` : ""}
          ${trust}
        </div>
        ${visual}
      </div>
    </section>`;
}

function itemMedia(ctx: Ctx, i: number): string {
  return slot(ctx, `item-${i}`);
}

function featureCard(ctx: Ctx, item: Item, i: number, extraClass = ""): string {
  const media = itemMedia(ctx, i);
  const top = media ? `<div className="media-frame">${media}</div>` : `<span className="icon-tile">${icon(itemIcon(item, i))}</span>`;
  return `<article className="card is-hover feature${extraClass}" data-reveal>
          ${top}
          <h3 className="h3">${jsxText(item.title)}</h3>
          <p>${jsxText(item.description)}</p>
          ${has(item.meta) ? `<p className="feature-meta">${jsxText(item.meta)}</p>` : ""}
        </article>`;
}

function renderFeatures(ctx: Ctx): string {
  const { c, o } = ctx;
  const items = c.items ?? [];
  const variant = o.variant ?? "grid";
  const cls = `sec ${bandClass(o)} sec-features`;

  if (variant === "list") {
    const rows = items
      .map((item, i) => {
        const media = itemMedia(ctx, i);
        return `<li data-reveal>
            <span className="icon-tile">${icon(itemIcon(item, i))}</span>
            <div>
              <h3 className="h3">${jsxText(item.title)}</h3>
              <p>${jsxText(item.description)}</p>
              ${has(item.meta) ? `<p className="feature-meta">${jsxText(item.meta)}</p>` : ""}
              ${media ? `<div className="media-frame" style={{ marginTop: "1rem" }}>${media}</div>` : ""}
            </div>
          </li>`;
      })
      .join("\n          ");
    return `
${open(ctx, cls)}
      <div className="container split-head">
        ${sectionHead(ctx, { left: true })}
        <ul className="feature-list">
          ${rows}
        </ul>
      </div>
    </section>`;
  }

  if (variant === "alternating") {
    const rows = items
      .map((item, i) => {
        const media = itemMedia(ctx, i);
        const ic = itemIcon(item, i);
        return `<div className="alt-row" data-reveal>
          <div className="alt-visual">${media ? `<div className="media-frame">${media}</div>` : panelVisual(item, ic)}</div>
          <div className="alt-copy">
            <span className="icon-tile">${icon(ic)}</span>
            <h3 className="h3">${jsxText(item.title)}</h3>
            <p>${jsxText(item.description)}</p>
            ${has(item.meta) ? `<p className="feature-meta">${jsxText(item.meta)}</p>` : ""}
          </div>
        </div>`;
      })
      .join("\n        ");
    return `
${open(ctx, cls)}
      <div className="container">
        ${sectionHead(ctx)}
        <div className="alt-rows">
        ${rows}
        </div>
      </div>
    </section>`;
  }

  if (variant === "bento") {
    const [first, ...rest] = items;
    const big = first
      ? (() => {
          const media = itemMedia(ctx, 0);
          const ic = itemIcon(first, 0);
          return `<article className="card is-hover feature bento-lg" data-reveal>
          <div>
            <span className="icon-tile">${icon(ic)}</span>
            <h3 className="h3" style={{ marginTop: "1rem" }}>${jsxText(first.title)}</h3>
            <p style={{ marginTop: "0.5rem" }}>${jsxText(first.description)}</p>
          </div>
          ${media ? `<div className="media-frame">${media}</div>` : meshVisual(ic)}
        </article>`;
        })()
      : "";
    // Two cards sit beside the large one and the rest fill rows of three; a
    // short last row stretches so the grid never ends on an empty cell.
    const lastRow = Math.max(0, rest.length - 2) % 3;
    const spanFor = (i: number) => {
      if (i < 2 || lastRow === 0 || i < rest.length - lastRow) return "";
      return lastRow === 1 ? " bento-full" : " bento-wide";
    };
    const cards = rest.map((item, i) => featureCard(ctx, item, i + 1, spanFor(i))).join("\n        ");
    return `
${open(ctx, cls)}
      <div className="container">
        ${sectionHead(ctx)}
        <div className="bento">
        ${big}
        ${cards}
        </div>
      </div>
    </section>`;
  }

  return `
${open(ctx, cls)}
      <div className="container">
        ${sectionHead(ctx)}
        <div className="feature-grid${items.length === 4 ? "" : " cols-3"}">
        ${items.map((item, i) => featureCard(ctx, item, i)).join("\n        ")}
        </div>
      </div>
    </section>`;
}

function renderSteps(ctx: Ctx): string {
  const { c, o } = ctx;
  const items = c.items ?? [];
  const cls = `sec ${bandClass(o)} sec-steps`;
  if (o.variant === "timeline") {
    const rows = items
      .map((item, i) => {
        const media = itemMedia(ctx, i);
        return `<li className="timeline-item" data-reveal>
            <span className="step-num" aria-hidden="true">${i + 1}</span>
            <div>
              <h3 className="h3"><span className="sr-only">${`Step ${i + 1}: `}</span>${jsxText(item.title)}</h3>
              <p>${jsxText(item.description)}</p>
              ${media ? `<div className="media-frame">${media}</div>` : ""}
            </div>
          </li>`;
      })
      .join("\n          ");
    return `
${open(ctx, cls)}
      <div className="container">
        ${sectionHead(ctx)}
        <ol className="timeline">
          ${rows}
        </ol>
      </div>
    </section>`;
  }
  const cards = items
    .map((item, i) => {
      const media = itemMedia(ctx, i);
      return `<li className="card step" data-reveal>
            <span className="step-num" aria-hidden="true">${i + 1}</span>
            <h3 className="h3"><span className="sr-only">${`Step ${i + 1}: `}</span>${jsxText(item.title)}</h3>
            <p>${jsxText(item.description)}</p>
            ${media ? `<div className="media-frame">${media}</div>` : ""}
          </li>`;
    })
    .join("\n          ");
  return `
${open(ctx, cls)}
      <div className="container">
        ${sectionHead(ctx)}
        <ol className="steps${items.length <= 4 ? " is-connected" : ""}">
          ${cards}
        </ol>
      </div>
    </section>`;
}

function personOf(item: Item): { name: string; role: string; quote: string; headline?: string } {
  const quote = item.description.trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, "");
  if (has(item.author)) {
    const role = [item.role, item.company].filter(has).join(", ");
    return { name: item.author, role, quote, headline: item.title.trim() !== item.author.trim() ? item.title : undefined };
  }
  const [name, ...rest] = item.title.split(/,\s*/);
  const role = [item.role ?? rest[0], item.company ?? rest.slice(1).join(", ")].filter(has).join(", ");
  return { name: name ?? item.title, role, quote };
}

function personRow(ctx: Ctx, item: Item, i: number): string {
  const p = personOf(item);
  const media = itemMedia(ctx, i);
  const avatar = media || `<span className="avatar" aria-hidden="true">${str(initials(p.name))}</span>`;
  return `<figcaption className="person">${avatar}<span><span className="person-name" style={{ display: "block" }}>${jsxText(p.name)}</span>${p.role ? `<span className="person-role" style={{ display: "block" }}>${jsxText(p.role)}</span>` : ""}</span></figcaption>`;
}

function quoteCard(ctx: Ctx, item: Item, i: number): string {
  const p = personOf(item);
  return `<figure className="card quote" data-reveal>
          ${icon("quote", "quote-mark")}
          ${p.headline ? `<p className="h3">${jsxText(p.headline)}</p>` : ""}
          <blockquote><p>${jsxText(p.quote)}</p></blockquote>
          ${personRow(ctx, item, i)}
        </figure>`;
}

function renderTestimonials(ctx: Ctx): string {
  const { c, o } = ctx;
  const items = c.items ?? [];
  const cls = `sec ${bandClass(o)} sec-testimonials`;
  if (o.variant === "featured" && items.length > 0) {
    const [first, ...rest] = items;
    const p = personOf(first!);
    return `
${open(ctx, cls)}
      <div className="container">
        ${sectionHead(ctx)}
        <figure className="quote-featured" data-reveal>
          ${icon("quote", "quote-mark")}
          ${p.headline ? `<p className="h3" style={{ marginBottom: "1rem" }}>${jsxText(p.headline)}</p>` : ""}
          <blockquote><p>${jsxText(p.quote)}</p></blockquote>
          ${personRow(ctx, first!, 0)}
        </figure>
        ${rest.length ? `<div className="quotes">${rest.map((item, i) => quoteCard(ctx, item, i + 1)).join("\n        ")}</div>` : ""}
      </div>
    </section>`;
  }
  return `
${open(ctx, cls)}
      <div className="container">
        ${sectionHead(ctx)}
        <div className="quotes">
        ${items.map((item, i) => quoteCard(ctx, item, i)).join("\n        ")}
        </div>
      </div>
    </section>`;
}

function renderPricing(ctx: Ctx): string {
  const { c, o } = ctx;
  const plans = plansOf(c);
  const cls = `sec ${bandClass(o)} sec-pricing`;
  const fallbackHref = siteHref(c.cta?.primaryHref) ?? o.site.primaryCta?.href ?? "#main";
  const fallbackLabel = has(c.cta?.primary) ? c.cta!.primary : o.site.primaryCta?.label ?? "Get started";
  const highlightIndex = plans.findIndex((p) => p.highlighted);
  const checks = (features: string[] | undefined) =>
    features && features.length
      ? `<ul className="checks">${features.map((f) => `<li>${icon("check")}<span>${jsxText(f)}</span></li>`).join("")}</ul>`
      : "";
  const price = (plan: (typeof plans)[number]) =>
    has(plan.price)
      ? `<p className="plan-price"><strong>${jsxText(plan.price)}</strong>${has(plan.period) ? `<span>${jsxText(plan.period)}</span>` : ""}</p>`
      : "";
  const button = (plan: (typeof plans)[number], primary: boolean) =>
    `<a className="btn ${primary ? "btn-primary" : "btn-secondary"}" href=${str(siteHref(plan.ctaHref) ?? fallbackHref)}>${jsxText(has(plan.cta) ? plan.cta : fallbackLabel)}</a>`;

  if (o.variant === "simple") {
    const rows = plans
      .map(
        (plan, i) => `<div className="card plan-row${i === highlightIndex ? " plan is-highlight" : ""}" data-reveal>
          <div>
            <h3 className="h3 plan-name">${jsxText(plan.name)}</h3>
            ${has(plan.description) ? `<p className="plan-desc">${jsxText(plan.description)}</p>` : ""}
            ${checks(plan.features)}
          </div>
          ${price(plan) || "<div />"}
          ${button(plan, i === highlightIndex || (highlightIndex < 0 && i === 0))}
        </div>`,
      )
      .join("\n        ");
    return `
${open(ctx, cls)}
      <div className="container">
        ${sectionHead(ctx)}
        <div className="plan-rows">
        ${rows}
        </div>
      </div>
    </section>`;
  }

  const cards = plans
    .slice(0, 4)
    .map((plan, i) => {
      const hi = i === highlightIndex;
      return `<div className="card plan${hi ? " is-highlight" : ""}" data-reveal>
          ${hi ? `<span className="plan-badge">Recommended</span>` : ""}
          <h3 className="h3 plan-name">${jsxText(plan.name)}</h3>
          ${price(plan)}
          ${has(plan.description) ? `<p className="plan-desc">${jsxText(plan.description)}</p>` : ""}
          ${checks(plan.features)}
          ${button(plan, hi || (highlightIndex < 0 && plans.length === 1))}
        </div>`;
    })
    .join("\n        ");
  const overflow = plans.length > 4 ? plans.slice(4).map((plan) => `<li>${jsxText(plan.name)}</li>`).join("") : "";
  return `
${open(ctx, cls)}
      <div className="container">
        ${sectionHead(ctx)}
        <div className="plans">
        ${cards}
        </div>
        ${overflow ? `<ul className="checks" style={{ maxWidth: "40rem", margin: "2rem auto 0" }}>${overflow}</ul>` : ""}
      </div>
    </section>`;
}

function renderFaq(ctx: Ctx): string {
  const { c, o } = ctx;
  const items = c.items ?? [];
  const cls = `sec ${bandClass(o)} sec-faq`;
  const list = items
    .map(
      (item) => `<details className="card faq-item" data-reveal>
            <summary><span>${jsxText(item.title)}</span>${icon("plus")}</summary>
            <p className="faq-a">${jsxText(item.description)}</p>
          </details>`,
    )
    .join("\n          ");
  if (o.variant === "two-column") {
    return `
${open(ctx, cls)}
      <div className="container split-head">
        ${sectionHead(ctx, { left: true })}
        <div className="faq">
          ${list}
        </div>
      </div>
    </section>`;
  }
  return `
${open(ctx, cls)}
      <div className="container container-narrow">
        ${sectionHead(ctx)}
        <div className="faq">
          ${list}
        </div>
      </div>
    </section>`;
}

function ctaPoints(c: Content): string {
  const items = c.items ?? [];
  if (!items.length) return "";
  return `<ul className="cta-points">${items.map((item) => `<li>${icon("check")}<span>${jsxText(item.title)}</span>${has(item.description) && item.description !== item.title ? `<span className="sr-only">${jsxText(` ${item.description}`)}</span>` : ""}</li>`).join("")}</ul>`;
}

function renderCta(ctx: Ctx): string {
  const { c, o } = ctx;
  const background = slot(ctx, "background");
  const variant = background ? "banner" : o.variant ?? "banner";
  const buttons = ctaButtons(c, o, { size: "lg", fallbackPrimary: true });
  if (variant === "split") {
    return `
${open(ctx, `sec ${bandClass(o)} sec-cta`)}
      <div className="container">
        <div className="card cta-split" data-reveal>
          <div>
            ${eyebrow(c)}${title(ctx, "h2")}
            ${intro(c)}
            ${ctaPoints(c)}
          </div>
          ${buttons ? `<div className="btn-row">${buttons}</div>` : ""}
        </div>
      </div>
    </section>`;
  }
  const tone = background ? (overlayOf(ctx, "background") === "light" ? " has-bg on-light" : " has-bg on-ink") : "";
  return `
${open(ctx, `sec ${bandClass(o)} sec-cta`)}
      <div className="container">
        <div className="cta-card${tone}" data-reveal>
          ${background}
          <div className="layer-front">
            ${title(ctx, "h2")}
            ${intro(c)}
            ${buttons ? `<div className="btn-row">${buttons}</div>` : ""}
            ${ctaPoints(c)}
          </div>
        </div>
      </div>
    </section>`;
}

function renderTeam(ctx: Ctx): string {
  const { c, o } = ctx;
  const members = (c.items ?? [])
    .map((item, i) => {
      const media = itemMedia(ctx, i);
      const role = has(item.role) ? item.role : item.description;
      return `<li className="card member" data-reveal>
          ${media || `<span className="avatar" aria-hidden="true">${str(initials(item.title))}</span>`}
          <h3 className="h3">${jsxText(item.title)}</h3>
          ${has(role) ? `<p>${jsxText(role)}</p>` : ""}
          ${has(item.role) && has(item.description) ? `<p>${jsxText(item.description)}</p>` : ""}
        </li>`;
    })
    .join("\n        ");
  return `
${open(ctx, `sec ${bandClass(o)} sec-team`)}
      <div className="container">
        ${sectionHead(ctx)}
        <ul className="team">
        ${members}
        </ul>
      </div>
    </section>`;
}

const EMAIL = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;
const PHONE_LIKE = /^\+?[\d\s().-]{7,20}$/;

function contactHref(value: string): string | null {
  const v = value.trim();
  if (EMAIL.test(v)) return safeHref(`mailto:${v}`);
  if (PHONE_LIKE.test(v)) return safeHref(`tel:${v}`);
  return safeHref(v);
}

function contactIcon(href: string | null, label: string): string {
  if (href?.startsWith("mailto:")) return "mail";
  if (href?.startsWith("tel:")) return "phone";
  if (href) return "globe";
  return /address|location|visit|office|studio/i.test(label) ? "map-pin" : "message";
}

export function contactMethods(c: Content): { label: string; value: string; href: string | null }[] {
  const out: { label: string; value: string; href: string | null }[] = [];
  const seen = new Set<string>();
  const push = (label: string, value: string, href: string | null) => {
    const key = href ?? `${label}|${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, value, href });
  };
  for (const l of c.links ?? []) {
    const href = siteHref(l.href);
    if (href) push(l.label, href.replace(/^(mailto|tel):/, ""), href);
  }
  if (has(c.cta?.primary)) {
    const href = siteHref(c.cta?.primaryHref);
    if (href && /^(mailto|tel):/.test(href)) push(c.cta!.primary, href.replace(/^(mailto|tel):/, ""), href);
  }
  for (const item of c.items ?? []) push(item.title, item.description, contactHref(item.description));
  return out;
}

function renderContact(ctx: Ctx): string {
  const { c, o } = ctx;
  const methods = contactMethods(c);
  const cards = methods
    .map((m) => {
      const inner = `<span className="icon-tile">${icon(contactIcon(m.href, m.label))}</span><span><span className="label">${jsxText(m.label)}</span><span className="value">${jsxText(m.value)}</span></span>`;
      return m.href
        ? `<a className="card contact-card" href=${str(m.href)} data-reveal>${inner}</a>`
        : `<div className="card contact-card" data-reveal>${inner}</div>`;
    })
    .join("\n          ");
  const fallback = !methods.length ? ctaButtons(c, o) : "";
  return `
${open(ctx, `sec ${bandClass(o)} sec-contact`)}
      <div className="container">
        ${sectionHead(ctx)}
        ${cards ? `<div className="contact-grid">\n          ${cards}\n        </div>` : ""}
        ${fallback ? `<div className="btn-row" style={{ justifyContent: "var(--head-justify)" }}>${fallback}</div>` : ""}
      </div>
    </section>`;
}

function renderStats(ctx: Ctx): string {
  const { c, o } = ctx;
  const stats = statsOf(c);
  const withHead = has(c.headline);
  const items =
    o.variant === "cards"
      ? stats.map((s) => `<li className="card stat-card" data-reveal><span className="stat-value">${jsxText(s.value)}</span><span className="stat-label">${jsxText(s.label)}</span></li>`)
      : stats.map((s) => `<li className="stat" data-reveal><span className="stat-value">${jsxText(s.value)}</span><span className="stat-label">${jsxText(s.label)}</span></li>`);
  return `
${open(ctx, `sec ${bandClass(o)} sec-stats`, withHead)}
      <div className="container">
        ${withHead ? sectionHead(ctx) : ""}
        <ul className="stats${o.variant === "cards" ? "" : " stats-row"}"${withHead ? "" : ` aria-label="Key figures"`}>
          ${items.join("\n          ")}
        </ul>
      </div>
    </section>`;
}

function renderLogos(ctx: Ctx): string {
  const { c, o } = ctx;
  const names = logosOf(c);
  const label = has(c.headline) ? c.headline : has(c.eyebrow) ? c.eyebrow : "Trusted by";
  const H = headingTag(ctx);
  const logos = names
    .map((name, i) => {
      const media = slot(ctx, `item-${i}`);
      return `<li>${media || jsxText(name)}</li>`;
    })
    .join("");
  return `
${open(ctx, `sec logos-sec ${bandClass(o)}`)}
      <div className="container" data-reveal>
        <${H} id="${ctx.titleId}" className="logos-label">${jsxText(label)}</${H}>
        <ul className="logo-row">${logos}</ul>
      </div>
    </section>`;
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n|\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function renderCustom(ctx: Ctx): string {
  const { c, o } = ctx;
  const background = slot(ctx, "background");
  const showcase = slot(ctx, "showcase");
  const logo = slot(ctx, "logo");
  const items = c.items ?? [];
  const tone = background ? (overlayOf(ctx, "background") === "light" ? " has-bg on-light" : " has-bg on-ink") : "";
  const body = has(c.body) ? paragraphs(c.body) : [];
  const cards = items.length
    ? `<div className="feature-grid cols-3 custom-cards">${items.map((item, i) => featureCard(ctx, item, i)).join("")}</div>`
    : "";
  return `
${open(ctx, `sec ${bandClass(o)} sec-custom${tone}`)}
      ${background}
      <div className="container${tone ? " layer-front" : ""}">
        <div className="sec-head" data-reveal>
          ${logo ? `<div style={{ marginBottom: "1rem" }}>${logo}</div>` : ""}${eyebrow(c)}${title(ctx, "h2")}
          ${has(c.subheadline) ? `<p className="lead">${jsxText(c.subheadline)}</p>` : ""}
        </div>
        ${body.length ? `<div className="prose" data-reveal style={{ marginInline: "var(--head-mx)", maxWidth: "65ch", textAlign: "var(--head-align)" }}>${body.map((t) => `<p>${jsxText(t)}</p>`).join("")}</div>` : ""}
        ${showcase ? `<div className="custom-media media-frame" data-reveal>${showcase}</div>` : ""}
        ${cards}
        ${c.cta?.primary ? `<div className="btn-row" style={{ marginTop: "2rem", justifyContent: "var(--head-justify)" }}>${ctaButtons(c, o)}</div>` : ""}
      </div>
    </section>`;
}

function renderHeader(ctx: Ctx): string {
  const { c, o } = ctx;
  const site = o.site;
  const logo = slot(ctx, "logo");
  const centered = o.variant === "centered";
  const brandInner = logo
    ? `${logo}<span className="sr-only">${jsxText(site.brand)}</span>`
    : `<span className="brand-mark" aria-hidden="true">${str(initials(site.brand).slice(0, 1))}</span><span>${jsxText(site.brand)}</span>`;
  const home: SiteLink = { label: site.brand, href: site.multiPage ? "/" : "#top", route: site.multiPage };
  const cta: SiteLink | undefined = has(c.cta?.primary)
    ? { label: c.cta!.primary, href: siteHref(c.cta?.primaryHref) ?? site.primaryCta?.href ?? "#main", route: false }
    : site.primaryCta;
  const links = site.nav.map((l) => `<li>${link(site, l, "", jsxText(l.label))}</li>`).join("");
  const ctaButton = (cls: string) => (cta ? `<a className="btn btn-primary ${cls}" href=${str(cta.href)}>${jsxText(cta.label)}</a>` : "");
  return `<header id="top" className="site-header v-header-${centered ? "centered" : "bar"}" data-header${ctx.citationAttr}>
        <div className="container header-inner">
          ${link(site, home, "brand", brandInner, ` aria-label=${str(`${site.brand} home`)}`)}
          <nav className="nav" id="site-nav" aria-label="Primary">
            <ul className="nav-links" data-nav-menu>${links}${cta ? `<li className="nav-cta-item">${ctaButton("")}</li>` : ""}</ul>
          </nav>
          <div className="header-actions">
            ${ctaButton("btn-sm header-cta")}
            <button className="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu" data-nav-toggle><span className="nav-toggle-bars" aria-hidden="true" /></button>
          </div>
        </div>
      </header>`;
}

const COPYRIGHT = /©|\(c\)|copyright|all rights reserved/i;

function renderFooter(ctx: Ctx): string {
  const { c, o } = ctx;
  const site = o.site;
  const tagline = [c.subheadline, c.body, c.headline].find((t) => has(t) && !COPYRIGHT.test(t)) ?? site.tagline;
  const legal = (c.links ?? [])
    .map((l) => ({ label: l.label, href: siteHref(l.href) }))
    .filter((l): l is { label: string; href: string } => !!l.href && has(l.label));
  const legalLinks = legal.map((l) => `<a href=${str(l.href)}>${jsxText(l.label)}</a>`).join("");
  const copy = `<p className="footer-copy">${str(`© ${site.year} ${site.brand}`)}</p>`;
  const explore = site.nav.map((l) => `<li>${link(site, l, "", jsxText(l.label))}</li>`).join("");
  const contact = site.contactLinks.map((l) => `<li><a href=${str(l.href)}>${jsxText(l.label)}</a></li>`).join("");
  const brandBlock = `<div className="brand" style={{ minHeight: "auto" }}><span className="brand-mark" aria-hidden="true">${str(initials(site.brand).slice(0, 1))}</span><span>${jsxText(site.brand)}</span></div>`;

  if (o.variant === "minimal") {
    return `<footer className="site-footer" aria-label="Footer"${ctx.citationAttr}>
        <div className="container footer-minimal">
          ${brandBlock}
          ${explore ? `<nav aria-label="Footer"><ul>${explore}</ul></nav>` : ""}
          <div className="footer-legal">${legalLinks}${copy}</div>
        </div>
      </footer>`;
  }
  const cols = [
    explore ? `<div className="footer-col"><h2>${site.multiPage ? "Pages" : "Explore"}</h2><ul>${explore}</ul></div>` : "",
    contact ? `<div className="footer-col"><h2>Get in touch</h2><ul>${contact}</ul></div>` : "",
  ].filter(Boolean);
  return `<footer className="site-footer" aria-label="Footer"${ctx.citationAttr}>
        <div className="container">
          <div className="footer-top">
            <div className="footer-brand">
              ${brandBlock}
              ${has(tagline) ? `<p>${jsxText(tagline)}</p>` : ""}
            </div>
            ${cols.length ? `<nav className="footer-cols" aria-label="Footer">${cols.join("")}</nav>` : "<div />"}
          </div>
          <div className="footer-bottom">
            ${copy}
            ${legalLinks ? `<div className="footer-legal">${legalLinks}</div>` : ""}
          </div>
        </div>
      </footer>`;
}

export function defaultSiteContext(): SiteContext {
  return {
    brand: "Home",
    year: new Date().getFullYear(),
    multiPage: false,
    preset: "minimal",
    nav: [],
    secondaryHref: "#main",
    featureLabels: [],
    contactLinks: [],
  };
}

export function sectionToJsx(section: Section, media?: SectionMedia, options?: Partial<SectionRenderOptions>): string {
  const o: SectionRenderOptions = {
    headingLevel: options?.headingLevel ?? (section.type === "HERO" ? 1 : 2),
    band: options?.band ?? "base",
    variant: options?.variant ?? resolveVariants([section], options?.site?.preset ?? "minimal")[0],
    site: options?.site ?? defaultSiteContext(),
  };
  if (!willRender(section)) return "";
  const id = sectionIdOf(section);
  // Consumed by the citationHover.js script this package injects, so the
  // preview and the deployed build share one definition.
  const citationAttr =
    section.citationIds && section.citationIds.length > 0
      ? ` data-citation-ids={${JSON.stringify(JSON.stringify(section.citationIds))}}`
      : "";
  const ctx: Ctx = { section, c: section.content ?? {}, o, id, titleId: `${id}-title`, media, citationAttr };
  switch (section.type) {
    case "HEADER":
      return renderHeader(ctx);
    case "FOOTER":
      return renderFooter(ctx);
    case "HERO":
      return renderHero(ctx);
    case "FEATURES":
      return renderFeatures(ctx);
    case "HOW_IT_WORKS":
      return renderSteps(ctx);
    case "TESTIMONIALS":
      return renderTestimonials(ctx);
    case "PRICING":
      return renderPricing(ctx);
    case "FAQ":
      return renderFaq(ctx);
    case "CTA":
      return renderCta(ctx);
    case "TEAM":
      return renderTeam(ctx);
    case "CONTACT":
      return renderContact(ctx);
    case "STATS":
      return renderStats(ctx);
    case "LOGOS":
      return renderLogos(ctx);
    default:
      return renderCustom(ctx);
  }
}

export function deriveBrand(spec: Pick<SiteSpec, "pages" | "designBrief">): string {
  const sections = spec.pages.flatMap((p) => p.sections);
  const header = sections.find((s) => s.type === "HEADER")?.content?.headline?.trim();
  if (header && header.length <= 40) return header;
  const product = spec.designBrief?.product?.trim();
  if (product && product.length <= 32 && product.split(/\s+/).length <= 4) return product;
  const footer = sections.find((s) => s.type === "FOOTER")?.content?.headline ?? "";
  const fromCopyright = /©\s*(?:\d{4}\s*)?([^.|]+?)(?:\.|\s+All rights|$)/i.exec(footer)?.[1]?.trim();
  if (fromCopyright && fromCopyright.length <= 40) return fromCopyright;
  const home = spec.pages.find((p) => p.type === "HOME") ?? spec.pages[0];
  const seoTitle = home?.seo?.title?.split(/\s+[|–—:-]\s+/)[0]?.trim();
  if (seoTitle && seoTitle.length <= 40) return seoTitle;
  const pageTitle = home?.title?.trim();
  if (pageTitle && !/^home$/i.test(pageTitle) && pageTitle.length <= 40) return pageTitle;
  return seoTitle?.slice(0, 40) || pageTitle?.slice(0, 40) || "Home";
}
