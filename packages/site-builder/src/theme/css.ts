import { contrastRatio, withAlpha } from "./color.js";
import type { ResolvedTheme } from "./theme.js";

const SERIF = /serif|playfair|lora|merriweather|garamond|fraunces|baskerville|cormorant|crimson|spectral|newsreader|bodoni|didot|prata|cardo|alegreya|libre caslon|gelasio|vollkorn|domine|bitter|zilla|young serif|instrument/i;
const MONO = /mono|code|courier/i;

function fontStack(name: string): string {
  if (MONO.test(name)) return `"${name}", ui-monospace, SFMono-Regular, Menlo, monospace`;
  if (SERIF.test(name) && !/sans/i.test(name)) return `"${name}", Georgia, "Times New Roman", serif`;
  return `"${name}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
}

const TYPE_SCALE = {
  restrained: {
    h1: "clamp(2.375rem, 1.55rem + 3.1vw, 3.625rem)",
    h2: "clamp(1.875rem, 1.4rem + 1.6vw, 2.5rem)",
    h3: "1.1875rem",
    lead: "clamp(1.0625rem, 1rem + 0.3vw, 1.2rem)",
    stat: "clamp(2.25rem, 1.7rem + 2vw, 3rem)",
    h1Line: 1.08,
  },
  editorial: {
    h1: "clamp(2.625rem, 1.35rem + 4.7vw, 4.75rem)",
    h2: "clamp(2rem, 1.35rem + 2.3vw, 3.125rem)",
    h3: "1.3125rem",
    lead: "clamp(1.125rem, 1.02rem + 0.42vw, 1.3rem)",
    stat: "clamp(2.5rem, 1.7rem + 2.8vw, 3.5rem)",
    h1Line: 1.05,
  },
  dramatic: {
    h1: "clamp(2.875rem, 1.05rem + 6.5vw, 6rem)",
    h2: "clamp(2.125rem, 1.2rem + 3.2vw, 3.75rem)",
    h3: "1.375rem",
    lead: "clamp(1.125rem, 1rem + 0.5vw, 1.35rem)",
    stat: "clamp(2.75rem, 1.6rem + 3.6vw, 4.25rem)",
    h1Line: 1.02,
  },
} as const;

const RADII = {
  sharp: { sm: "2px", md: "3px", lg: "4px", btn: "3px" },
  soft: { sm: "6px", md: "10px", lg: "16px", btn: "10px" },
  rounded: { sm: "10px", md: "16px", lg: "24px", btn: "14px" },
  pill: { sm: "14px", md: "22px", lg: "32px", btn: "999px" },
} as const;

const DENSITY = { airy: 1.25, balanced: 1, compact: 0.85 } as const;

const MOTION = {
  subtle: { dur: "160ms", reveal: "10px", lift: "-1px", revealDur: "520ms" },
  standard: { dur: "220ms", reveal: "18px", lift: "-2px", revealDur: "640ms" },
  expressive: { dur: "300ms", reveal: "30px", lift: "-4px", revealDur: "780ms" },
} as const;

function shadows(theme: ResolvedTheme): { sm: string; md: string; lg: string } {
  const dark = theme.colorMode === "dark";
  const c = (a: number) => withAlpha(dark ? "#000000" : theme.palette.ink, dark ? Math.min(0.6, a * 3) : a);
  switch (theme.tokens.shadow) {
    case "none":
      return { sm: "none", md: "none", lg: "none" };
    case "subtle":
      return {
        sm: `0 1px 2px ${c(0.05)}`,
        md: `0 1px 2px ${c(0.04)}, 0 4px 14px ${c(0.05)}`,
        lg: `0 2px 4px ${c(0.04)}, 0 14px 36px ${c(0.08)}`,
      };
    case "layered":
      return {
        sm: `0 1px 2px ${c(0.06)}, 0 2px 6px ${c(0.04)}`,
        md: `0 1px 2px ${c(0.05)}, 0 6px 16px ${c(0.06)}, 0 18px 40px ${c(0.05)}`,
        lg: `0 2px 6px ${c(0.06)}, 0 20px 44px ${c(0.1)}, 0 44px 90px ${c(0.08)}`,
      };
    case "heavy":
      return {
        sm: `0 2px 4px ${c(0.08)}, 0 4px 10px ${c(0.06)}`,
        md: `0 2px 6px ${c(0.08)}, 0 12px 28px ${c(0.12)}`,
        lg: `0 4px 10px ${c(0.1)}, 0 28px 64px ${c(0.18)}`,
      };
  }
}

const NOISE = (frequency: number) =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

function surfaceVars(theme: ResolvedTheme): string {
  const p = theme.palette;
  const dark = theme.colorMode === "dark";
  const borderW = { none: "0px", hairline: "1px", regular: "1px", heavy: "2px" }[theme.tokens.borderWeight];
  const borderC = theme.tokens.borderWeight === "hairline" || theme.tokens.borderWeight === "none" ? p.border : p.borderStrong;
  const base = `  --border-w: ${borderW};
  --border-c: ${borderC};`;
  switch (theme.tokens.surface) {
    case "flat":
      return `${base}
  --card-bg: var(--c-card);
  --card-shadow: none;
  --card-filter: none;
  --card-highlight: none;`;
    case "matte":
      return `${base}
  --card-bg: var(--c-card);
  --card-shadow: ${theme.tokens.borderWeight === "none" ? "var(--shadow)" : "var(--shadow-sm)"};
  --card-filter: none;
  --card-highlight: none;`;
    case "glass":
      return `${base}
  --card-bg: ${withAlpha(p.card, dark ? 0.62 : 0.68)};
  --card-shadow: var(--shadow-sm);
  --card-filter: blur(16px) saturate(140%);
  --card-highlight: inset 0 1px 0 ${withAlpha("#ffffff", dark ? 0.08 : 0.6)};`;
    case "skeuomorphic":
      return `${base}
  --card-bg: linear-gradient(180deg, ${p.card}, color-mix(in srgb, ${p.card} 97%, ${p.ink}));
  --card-shadow: var(--shadow-sm);
  --card-filter: none;
  --card-highlight: inset 0 1px 0 ${withAlpha("#ffffff", dark ? 0.06 : 0.75)};`;
  }
}

function textureCss(theme: ResolvedTheme): string {
  const t = theme.tokens.texture;
  if (t === "none") return "";
  const dark = theme.colorMode === "dark";
  const opacity = { "grain-subtle": dark ? 0.06 : 0.05, "grain-heavy": dark ? 0.12 : 0.1, paper: dark ? 0.07 : 0.07 }[t];
  const freq = t === "paper" ? 0.55 : 0.85;
  return `
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  opacity: ${opacity};
  background-image: ${NOISE(freq)};
  mix-blend-mode: ${dark ? "soft-light" : "multiply"};
}`;
}

function eyebrowCss(theme: ResolvedTheme): string {
  switch (theme.preset) {
    case "editorial":
    case "warm":
      return `
.eyebrow, .hero-media .eyebrow { padding: 0; background: none; border: 0; text-transform: uppercase; letter-spacing: 0.14em; font-size: var(--fs-xs); }
.eyebrow::before { content: ""; width: 1.75rem; height: 1px; background: currentColor; border-radius: 0; }`;
    case "tech":
      return `
.eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: var(--fs-xs); }`;
    case "bold":
      return `
.eyebrow { background: var(--c-primary); color: var(--c-on-primary); border-color: transparent; }
.eyebrow::before { background: currentColor; }`;
    default:
      return "";
  }
}

// A brand fill that blends into the dark ink surface flips to a light button there.
function inkButtonCss(theme: ResolvedTheme): string {
  if (contrastRatio(theme.palette.primary, theme.palette.ink) >= 3) return "";
  return `
.hero-media.on-ink .btn-primary { background: var(--c-on-ink); color: var(--c-ink); }
.hero-media.on-ink .btn-primary:hover { background: color-mix(in srgb, var(--c-on-ink) 88%, var(--c-ink)); }`;
}

export function buildDesignSystemCss(theme: ResolvedTheme): string {
  const p = theme.palette;
  const t = theme.tokens;
  const scale = TYPE_SCALE[t.typeScale];
  const radius = RADII[t.radius];
  const motion = MOTION[t.motionIntensity];
  const sh = shadows(theme);
  const centered = t.layoutGrid === "centered" || t.layoutGrid === "modular" || t.layoutGrid === "narrow";
  const container = t.layoutGrid === "narrow" ? "1040px" : "1200px";

  return `:root {
  color-scheme: ${theme.colorMode};
  --c-bg: ${p.bg};
  --c-surface: ${p.surface};
  --c-tint: ${p.tint};
  --c-card: ${p.card};
  --c-border: ${p.border};
  --c-border-strong: ${p.borderStrong};
  --c-text: ${p.text};
  --c-text-muted: ${p.textMuted};
  --c-primary: ${p.primary};
  --c-primary-hover: ${p.primaryHover};
  --c-on-primary: ${p.onPrimary};
  --c-primary-text: ${p.primaryText};
  --c-primary-soft: ${p.primarySoft};
  --c-on-primary-soft: ${p.onPrimarySoft};
  --c-accent: ${p.accent};
  --c-accent-text: ${p.accentText};
  --c-accent-soft: ${p.accentSoft};
  --c-secondary: ${p.secondary};
  --c-secondary-soft: ${p.secondarySoft};
  --c-cta-from: ${p.ctaFrom};
  --c-cta-to: ${p.ctaTo};
  --c-ink: ${p.ink};
  --c-on-ink: ${p.onInk};
  --c-on-ink-muted: ${p.onInkMuted};
  --c-ring: ${p.primaryText};
  --primary: var(--c-primary);
  --secondary: var(--c-secondary);
  --accent: var(--c-accent);

  --font-heading: ${fontStack(theme.fonts.heading)};
  --font-body: ${fontStack(theme.fonts.body)};
  --font-primary: var(--font-heading);
  --font-secondary: var(--font-body);
  --fs-body: ${(theme.bodyPx / 16).toFixed(4)}rem;
  --fs-sm: calc(var(--fs-body) * 0.9);
  --fs-xs: max(0.8125rem, calc(var(--fs-body) * 0.78));
  --fs-lead: max(var(--fs-body), ${scale.lead});
  --fs-h1: ${scale.h1};
  --fs-h2: ${scale.h2};
  --fs-h3: max(var(--fs-body), ${scale.h3});
  --fs-stat: ${scale.stat};
  --lh-h1: ${scale.h1Line};
  --heading-weight: ${theme.headingWeight};
  --heading-tracking: ${theme.headingTracking};

  --density: ${DENSITY[t.density]};
  --space-1: calc(0.25rem * var(--density));
  --space-2: calc(0.5rem * var(--density));
  --space-3: calc(0.75rem * var(--density));
  --space-4: calc(1rem * var(--density));
  --space-5: calc(1.5rem * var(--density));
  --space-6: calc(2rem * var(--density));
  --space-7: calc(3rem * var(--density));
  --space-8: calc(4rem * var(--density));
  --space-9: calc(6rem * var(--density));
  --section-y: clamp(calc(3.5rem * var(--density)), calc(2rem + 6vw), calc(7.5rem * var(--density)));
  --container: ${container};
  --container-narrow: 760px;
  --gutter: clamp(1rem, 4vw, 2rem);
  --head-align: ${centered ? "center" : "left"};
  --head-mx: ${centered ? "auto" : "0"};
  --head-justify: ${centered ? "center" : "flex-start"};

  --radius-sm: ${radius.sm};
  --radius: ${radius.md};
  --radius-lg: ${radius.lg};
  --radius-btn: ${radius.btn};
  --shadow-sm: ${sh.sm};
  --shadow: ${sh.md};
  --shadow-lg: ${sh.lg};
${surfaceVars(theme)}

  --touch: ${theme.touchPx}px;
  --dur: ${motion.dur};
  --reveal-y: ${motion.reveal};
  --reveal-dur: ${motion.revealDur};
  --lift: ${motion.lift};
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);
}
${BASE_CSS}${inkButtonCss(theme)}${eyebrowCss(theme)}${textureCss(theme)}
`;
}

const BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--fs-body);
  line-height: 1.65;
  color: var(--c-text);
  background: var(--c-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overflow-x: clip;
}
h1, h2, h3, h4, p, figure, blockquote, dl, dd, ul, ol { margin: 0; }
ul, ol { padding: 0; list-style: none; }
img, picture, video, svg { display: block; max-width: 100%; }
a { color: inherit; text-decoration: none; }
button { font: inherit; color: inherit; }
::selection { background: var(--c-primary-soft); color: var(--c-on-primary-soft); }
h1, h2, h3, h4 {
  font-family: var(--font-heading);
  font-weight: var(--heading-weight);
  letter-spacing: var(--heading-tracking);
  line-height: 1.12;
  color: var(--c-text);
  text-wrap: balance;
}
p { text-wrap: pretty; }
:focus-visible { outline: 2px solid var(--c-ring); outline-offset: 3px; border-radius: 4px; }
.on-ink :focus-visible { outline-color: var(--c-on-ink); }

.skip-link {
  position: absolute; left: 1rem; top: -100px; z-index: 200;
  padding: 0.75rem 1rem; border-radius: var(--radius-sm);
  background: var(--c-primary); color: var(--c-on-primary); font-weight: 600;
}
.skip-link:focus { top: 1rem; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

.container { width: 100%; max-width: calc(var(--container) + var(--gutter) * 2); margin-inline: auto; padding-inline: var(--gutter); }
.container-narrow { max-width: calc(var(--container-narrow) + var(--gutter) * 2); }

.sec { position: relative; padding-block: var(--section-y); scroll-margin-top: 72px; }
.band-base { background: var(--c-bg); }
.band-subtle { background: var(--c-surface); }
.band-tint { background: var(--c-tint); }
.has-bg { position: relative; overflow: hidden; isolation: isolate; }
.sec.has-bg.on-ink { background: var(--c-ink); color: var(--c-on-ink); }
.sec.has-bg.on-ink :is(.h2, .h3) { color: var(--c-on-ink); }
.sec.has-bg.on-ink :is(.lead, .body, .prose p) { color: var(--c-on-ink-muted); }
.layer-front { position: relative; z-index: 2; }

.sec-head { max-width: 46rem; margin-inline: var(--head-mx); text-align: var(--head-align); margin-bottom: clamp(2.25rem, 4vw, 3.5rem); }
.sec-head.is-left { margin-inline: 0; text-align: left; }
.sec-head.is-left .eyebrow { justify-content: flex-start; }
.sec-head .h2 + .lead, .sec-head .h2 + .body { margin-top: var(--space-4); }
.sec-head .lead + .body { margin-top: var(--space-3); }
.sec-head .lead, .sec-head .body { margin-inline: inherit; }

.eyebrow {
  display: inline-flex; align-items: center; gap: 0.5rem;
  margin-bottom: var(--space-4);
  padding: 0.35rem 0.85rem;
  border-radius: 999px;
  border: 1px solid var(--c-border);
  background: var(--c-card);
  color: var(--c-primary-text);
  font-size: var(--fs-sm); font-weight: 600; letter-spacing: 0.01em; line-height: 1.3;
}
.eyebrow::before { content: ""; width: 6px; height: 6px; border-radius: 999px; background: var(--c-accent); flex: none; }
.h1 { font-size: var(--fs-h1); line-height: var(--lh-h1); }
.h2 { font-size: var(--fs-h2); }
.h3 { font-size: var(--fs-h3); line-height: 1.3; letter-spacing: -0.01em; }
.lead { font-size: var(--fs-lead); line-height: 1.6; color: var(--c-text-muted); max-width: 62ch; }
.body { color: var(--c-text-muted); max-width: 65ch; }
.muted { color: var(--c-text-muted); }
.prose p { max-width: 65ch; color: var(--c-text-muted); }
.prose p + p { margin-top: 1em; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
  min-height: var(--touch); padding: 0.7rem 1.35rem;
  border-radius: var(--radius-btn); border: 1px solid transparent;
  font-family: var(--font-body); font-size: var(--fs-body); font-weight: 600; line-height: 1.2;
  text-align: center; cursor: pointer;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease), border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.btn .icon { width: 1.1em; height: 1.1em; transition: transform var(--dur) var(--ease); }
.btn:hover .icon { transform: translateX(2px); }
.btn:active { transform: translateY(1px); }
.btn-primary { background: var(--c-primary); color: var(--c-on-primary); box-shadow: var(--shadow-sm); }
.btn-primary:hover { background: var(--c-primary-hover); box-shadow: var(--shadow); }
.btn-secondary { background: var(--c-card); color: var(--c-text); border-color: var(--c-border-strong); }
.btn-secondary:hover { border-color: var(--c-text-muted); background: var(--c-surface); }
.btn-ghost-ink { background: transparent; color: var(--c-on-ink); border-color: color-mix(in srgb, var(--c-on-ink) 45%, transparent); }
.btn-ghost-ink:hover { background: color-mix(in srgb, var(--c-on-ink) 12%, transparent); }
.btn-ink { background: var(--c-on-ink); color: var(--c-ink); }
.btn-ink:hover { background: color-mix(in srgb, var(--c-on-ink) 88%, var(--c-ink)); }
.btn-lg { padding: 0.85rem 1.6rem; }
.btn-sm { padding: 0.55rem 1.05rem; font-size: var(--fs-sm); }
.btn-row { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
.btn-row.is-center { justify-content: center; }

.card {
  position: relative;
  background: var(--card-bg);
  border: var(--border-w) solid var(--border-c);
  border-radius: var(--radius-lg);
  box-shadow: var(--card-highlight, none), var(--card-shadow);
  -webkit-backdrop-filter: var(--card-filter);
  backdrop-filter: var(--card-filter);
  transition: transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease), border-color var(--dur) var(--ease);
}
.card.is-hover:hover { transform: translateY(var(--lift)); box-shadow: var(--card-highlight, none), var(--shadow); }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .card { background: var(--c-card); }
}
.icon { width: 1.5rem; height: 1.5rem; flex: none; }
.icon-tile {
  display: inline-grid; place-items: center; width: 2.75rem; height: 2.75rem; flex: none;
  border-radius: var(--radius); background: var(--c-primary-soft); color: var(--c-on-primary-soft);
}
.icon-tile .icon { width: 1.35rem; height: 1.35rem; }
.media-frame { overflow: hidden; border-radius: var(--radius-lg); }
.media-frame > picture, .media-frame > video, .media-frame img { width: 100%; }

/* Header */
.site-header { position: sticky; top: 0; z-index: 50; transition: background-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease), border-color var(--dur) var(--ease); border-bottom: 1px solid transparent; }
.site-header.is-scrolled, .site-header.is-open {
  background: color-mix(in srgb, var(--c-bg) 82%, transparent);
  -webkit-backdrop-filter: blur(14px) saturate(160%); backdrop-filter: blur(14px) saturate(160%);
  border-bottom-color: var(--c-border);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .site-header.is-scrolled, .site-header.is-open { background: var(--c-bg); }
}
.header-inner { display: flex; align-items: center; gap: var(--space-5); min-height: 4.25rem; }
.brand { display: inline-flex; align-items: center; gap: 0.6rem; min-height: var(--touch); font-family: var(--font-heading); font-weight: 700; font-size: 1.15rem; letter-spacing: -0.02em; color: var(--c-text); }
.brand-mark { display: inline-grid; place-items: center; width: 2rem; height: 2rem; border-radius: var(--radius); background: linear-gradient(135deg, var(--c-cta-from), var(--c-cta-to)); color: var(--c-on-primary); font-size: 0.95rem; }
.brand img { max-height: 40px; width: auto; }
.nav { margin-left: auto; }
.nav-links { display: flex; align-items: center; gap: 0.25rem; }
.nav-links a { display: inline-flex; align-items: center; min-height: var(--touch); padding: 0 0.8rem; border-radius: var(--radius-sm); color: var(--c-text-muted); font-size: var(--fs-sm); font-weight: 500; transition: color var(--dur) var(--ease), background-color var(--dur) var(--ease); }
.nav-links a:hover { color: var(--c-text); background: var(--c-surface); }
.nav-cta-item { display: none; }
.header-actions { display: flex; align-items: center; gap: var(--space-2); }
.nav-toggle { display: none; place-items: center; width: var(--touch); height: var(--touch); border-radius: var(--radius-sm); border: 1px solid var(--c-border); background: var(--c-card); cursor: pointer; }
.nav-toggle-bars, .nav-toggle-bars::before, .nav-toggle-bars::after { display: block; width: 18px; height: 2px; border-radius: 2px; background: var(--c-text); transition: transform var(--dur) var(--ease), opacity var(--dur) var(--ease); }
.nav-toggle-bars { position: relative; }
.nav-toggle-bars::before, .nav-toggle-bars::after { content: ""; position: absolute; left: 0; }
.nav-toggle-bars::before { top: -6px; }
.nav-toggle-bars::after { top: 6px; }
.is-open .nav-toggle-bars { background: transparent; }
.is-open .nav-toggle-bars::before { transform: translateY(6px) rotate(45deg); }
.is-open .nav-toggle-bars::after { transform: translateY(-6px) rotate(-45deg); }
.v-header-centered .header-inner { flex-wrap: wrap; justify-content: center; padding-block: var(--space-2); }
.v-header-centered .nav { margin-left: 0; order: 3; width: 100%; display: flex; justify-content: center; }
.v-header-centered .brand { margin-right: auto; }
@media (min-width: 900px) {
  .v-header-centered .brand { margin-inline: auto; }
  .v-header-centered .header-actions { position: absolute; right: var(--gutter); top: 0.85rem; }
  .v-header-centered .header-inner { position: relative; }
}
@media (max-width: 899px) {
  .nav-toggle { display: inline-grid; }
  .header-cta { display: none; }
  .header-inner { justify-content: space-between; flex-wrap: nowrap; }
  .v-header-centered .nav, .nav { position: absolute; left: 0; right: 0; top: 100%; margin: 0; display: none; width: auto; padding: var(--space-3) var(--gutter) var(--space-5); background: var(--c-bg); border-bottom: 1px solid var(--c-border); box-shadow: var(--shadow-lg); }
  .is-open .nav { display: block; }
  .nav-links { flex-direction: column; align-items: stretch; gap: 0; }
  .nav-links a { font-size: var(--fs-body); padding-inline: 0.5rem; }
  .nav-cta-item { display: block; margin-top: var(--space-3); }
  .nav-cta-item .btn { width: 100%; color: var(--c-on-primary); }
  .nav-cta-item .btn:hover { color: var(--c-on-primary); background: var(--c-primary-hover); }
}

/* Hero */
.hero { position: relative; padding-block: clamp(3.5rem, 2rem + 7vw, 8rem) var(--section-y); overflow: hidden; isolation: isolate; }
.hero-backdrop { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
.hero-backdrop::before { content: ""; position: absolute; inset: -20% -10% auto; height: 120%; background:
  radial-gradient(42% 46% at 18% 18%, color-mix(in srgb, var(--c-primary-soft) 90%, transparent), transparent 70%),
  radial-gradient(36% 40% at 82% 12%, color-mix(in srgb, var(--c-accent-soft) 85%, transparent), transparent 72%),
  radial-gradient(40% 36% at 60% 70%, color-mix(in srgb, var(--c-secondary-soft) 70%, transparent), transparent 75%); }
.hero-backdrop::after { content: ""; position: absolute; inset: 0; background-image: linear-gradient(var(--c-border) 1px, transparent 1px), linear-gradient(90deg, var(--c-border) 1px, transparent 1px); background-size: 56px 56px; opacity: 0.35; -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%); mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%); }
.hero .h1 { max-width: 18ch; }
.hero .lead { margin-top: var(--space-5); }
.hero .btn-row { margin-top: var(--space-6); }
.hero-centered { text-align: center; }
.hero-centered .h1, .hero-centered .lead, .hero-centered .body { margin-inline: auto; }
.hero .lead + .body { margin-top: var(--space-3); }
.hero-centered .hero-visual { margin-top: clamp(3rem, 6vw, 4.5rem); max-width: 1040px; margin-inline: auto; }
.hero-split .hero-grid { display: grid; gap: clamp(2.5rem, 5vw, 4rem); align-items: center; }
@media (min-width: 960px) { .hero-split .hero-grid { grid-template-columns: 1.05fr 1fr; } }
.hero-editorial .h1 { max-width: 16ch; font-size: calc(var(--fs-h1) * 1.08); }
.hero-editorial .hero-rule { display: grid; gap: var(--space-5) var(--space-7); margin-top: clamp(2rem, 4vw, 3rem); padding-top: clamp(1.5rem, 3vw, 2rem); border-top: var(--border-w, 1px) solid var(--c-border-strong); align-items: start; }
.hero-editorial .hero-rule .lead { margin-top: 0; }
.hero-editorial .hero-rule .btn-row { margin-top: 0; }
@media (min-width: 900px) { .hero-editorial .hero-rule { grid-template-columns: 1.4fr 1fr; } .hero-editorial .hero-rule .btn-row { justify-content: flex-end; } }
.hero-editorial .hero-visual { margin-top: clamp(2.5rem, 5vw, 4rem); }
.hero-tags { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: clamp(2rem, 4vw, 3rem); }
.tag { display: inline-flex; align-items: center; gap: 0.45rem; min-height: 2.25rem; padding: 0.3rem 0.85rem; border-radius: 999px; border: 1px solid var(--c-border); background: var(--c-card); color: var(--c-text); font-size: var(--fs-sm); font-weight: 500; }
.tag .icon { width: 1rem; height: 1rem; color: var(--c-primary-text); }
.hero-media { min-height: min(88vh, 860px); display: flex; align-items: flex-end; padding-block: clamp(7rem, 12vw, 10rem) clamp(3rem, 6vw, 5rem); background: var(--c-ink); color: var(--c-on-ink); }
.hero-media .container { width: 100%; }
.hero-media .h1 { color: var(--c-on-ink); max-width: 16ch; }
.hero-media .lead { color: var(--c-on-ink-muted); }
.hero-media .eyebrow { background: color-mix(in srgb, var(--c-on-ink) 12%, transparent); border-color: color-mix(in srgb, var(--c-on-ink) 25%, transparent); color: var(--c-on-ink); }
.hero-media .ink-mesh { position: absolute; inset: 0; z-index: 0; background:
  radial-gradient(48% 60% at 85% 20%, color-mix(in srgb, var(--c-cta-to) 55%, transparent), transparent 70%),
  radial-gradient(40% 50% at 10% 90%, color-mix(in srgb, var(--c-accent) 35%, transparent), transparent 70%),
  radial-gradient(60% 70% at 50% 50%, color-mix(in srgb, var(--c-cta-from) 30%, transparent), transparent 80%); }
.hero-media .hero-scrim { position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, transparent 30%, rgba(0, 0, 0, 0.45)); pointer-events: none; }
.hero-media.on-light { color: var(--c-text); }
.hero-media.on-light .h1 { color: var(--c-text); }
.hero-media.on-light .lead { color: var(--c-text-muted); }
.hero-media.on-light .hero-scrim { background: linear-gradient(180deg, transparent 30%, rgba(255, 255, 255, 0.5)); }
.trust { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3) var(--space-6); margin-top: clamp(2rem, 4vw, 3rem); color: var(--c-text-muted); font-size: var(--fs-sm); }
.hero-centered .trust { justify-content: center; }
.trust-stat { display: flex; flex-direction: column; line-height: 1.25; }
.trust-stat strong { color: var(--c-text); font-family: var(--font-heading); font-size: 1.5rem; letter-spacing: -0.02em; }
.hero-media .trust, .hero-media .trust-stat strong { color: var(--c-on-ink); }
.trust-logo { font-family: var(--font-heading); font-weight: 700; font-size: 1.05rem; letter-spacing: -0.01em; opacity: 0.85; }

/* CSS visuals */
.visual { position: relative; border-radius: var(--radius-lg); }
.visual-mesh { aspect-ratio: 4 / 3; overflow: hidden; background: var(--c-tint); border: var(--border-w) solid var(--border-c); }
.visual-mesh .blob { position: absolute; border-radius: 999px; filter: blur(2px); }
.visual-mesh .b1 { width: 62%; aspect-ratio: 1; left: -8%; top: -12%; background: radial-gradient(circle at 30% 30%, var(--c-primary-soft), transparent 70%); }
.visual-mesh .b2 { width: 54%; aspect-ratio: 1; right: -10%; top: 18%; background: radial-gradient(circle at 50% 50%, var(--c-accent-soft), transparent 70%); }
.visual-mesh .b3 { width: 46%; aspect-ratio: 1; left: 30%; bottom: -16%; background: radial-gradient(circle at 50% 50%, var(--c-secondary-soft), transparent 70%); }
.visual-mesh .mesh-icon { position: absolute; inset: 0; display: grid; place-items: center; }
.visual-mesh .mesh-icon .icon-tile { width: 4.5rem; height: 4.5rem; border-radius: var(--radius-lg); background: var(--c-card); box-shadow: var(--shadow); color: var(--c-primary-text); }
.visual-mesh .mesh-icon .icon { width: 2rem; height: 2rem; }

.visual-product { padding: clamp(0.5rem, 2vw, 1rem); }
.vp-window { position: relative; overflow: hidden; border-radius: var(--radius-lg); background: var(--c-card); border: 1px solid var(--c-border); box-shadow: var(--shadow-lg); text-align: left; }
.vp-glow { position: absolute; inset: 8% 6% -6%; z-index: -1; border-radius: 40px; background: linear-gradient(120deg, var(--c-cta-from), var(--c-cta-to)); opacity: 0.22; filter: blur(48px); }
.vp-bar { display: flex; align-items: center; gap: 6px; padding: 0.7rem 0.9rem; border-bottom: 1px solid var(--c-border); background: var(--c-surface); }
.vp-bar > span:not(.vp-title) { width: 10px; height: 10px; border-radius: 999px; background: var(--c-border-strong); }
.vp-title { margin-left: 0.5rem; font-size: var(--fs-xs); font-weight: 600; color: var(--c-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vp-body { display: grid; grid-template-columns: minmax(0, 9.5rem) minmax(0, 1fr); min-height: 17rem; }
.vp-side { display: flex; flex-direction: column; gap: 0.55rem; padding: 1rem; border-right: 1px solid var(--c-border); background: color-mix(in srgb, var(--c-surface) 55%, var(--c-card)); }
.vp-side span { height: 0.6rem; border-radius: 999px; background: var(--c-border); }
.vp-side span.is-active { background: var(--c-primary); width: 80%; }
.vp-side span:nth-child(3) { width: 70%; } .vp-side span:nth-child(4) { width: 85%; } .vp-side span:nth-child(5) { width: 60%; }
.vp-main { display: grid; gap: 0.9rem; padding: 1rem 1.1rem 1.2rem; min-width: 0; }
.vp-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.6rem; }
.vp-kpi { padding: 0.65rem 0.7rem; border-radius: var(--radius); border: 1px solid var(--c-border); background: var(--c-card); min-width: 0; }
.vp-kpi-label { display: block; font-size: 0.72rem; font-weight: 600; color: var(--c-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vp-kpi-bar { display: block; height: 0.4rem; margin-top: 0.5rem; border-radius: 999px; background: linear-gradient(90deg, var(--c-cta-from), var(--c-cta-to)); }
.vp-chart { display: flex; align-items: flex-end; gap: 0.45rem; height: 6.5rem; padding: 0.6rem 0.7rem 0; border-radius: var(--radius); background: var(--c-surface); }
.vp-chart span { flex: 1; border-radius: 6px 6px 0 0; background: color-mix(in srgb, var(--c-primary) 30%, var(--c-card)); }
.vp-chart span:nth-child(3n) { background: var(--c-primary); }
.vp-list { display: grid; gap: 0.45rem; }
.vp-list li { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; font-weight: 500; color: var(--c-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.vp-list .icon { width: 0.95rem; height: 0.95rem; color: var(--c-primary-text); }
.vp-float { position: absolute; right: clamp(-0.5rem, -1vw, 0rem); bottom: clamp(-1rem, -2vw, -0.5rem); display: flex; align-items: center; gap: 0.6rem; max-width: 16rem; padding: 0.7rem 0.9rem; border-radius: var(--radius); background: var(--c-card); border: 1px solid var(--c-border); box-shadow: var(--shadow-lg); font-size: 0.82rem; font-weight: 600; }
.vp-float .icon-tile { width: 2rem; height: 2rem; }
.vp-float .icon-tile .icon { width: 1rem; height: 1rem; }
.vp-float span:last-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 560px) { .vp-body { grid-template-columns: minmax(0, 1fr); } .vp-side { display: none; } .vp-float { display: none; } }

.visual-panel { display: grid; place-items: center; aspect-ratio: 4 / 3; overflow: hidden; background: linear-gradient(140deg, var(--c-primary-soft), var(--c-accent-soft)); border: var(--border-w) solid var(--border-c); }
.vpanel-card { display: grid; gap: 0.7rem; width: min(72%, 20rem); padding: 1.2rem; border-radius: var(--radius-lg); background: var(--c-card); box-shadow: var(--shadow-lg); }
.vpanel-card .icon-tile { width: 3rem; height: 3rem; }
.vpanel-card strong { font-family: var(--font-heading); font-size: 1rem; line-height: 1.3; }
.vpanel-lines { display: grid; gap: 0.45rem; }
.vpanel-lines span { height: 0.5rem; border-radius: 999px; background: var(--c-border); }
.vpanel-lines span:nth-child(2) { width: 82%; } .vpanel-lines span:nth-child(3) { width: 58%; background: var(--c-primary-soft); }

/* Features */
.feature-grid { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); }
.feature-grid.cols-3 { grid-template-columns: repeat(auto-fit, minmax(min(100%, max(16rem, calc((100% - 2 * var(--space-5)) / 3))), 1fr)); }
.feature { display: flex; flex-direction: column; gap: var(--space-3); padding: clamp(1.4rem, 2.5vw, 1.9rem); }
.feature .h3 { margin-top: var(--space-2); }
.feature p { color: var(--c-text-muted); }
.feature .media-frame { margin: calc(-1 * clamp(1.4rem, 2.5vw, 1.9rem)) calc(-1 * clamp(1.4rem, 2.5vw, 1.9rem)) var(--space-2); border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
.feature-meta { margin-top: auto; padding-top: var(--space-2); font-size: var(--fs-sm); font-weight: 600; color: var(--c-primary-text); }
.bento { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 700px) { .bento { grid-template-columns: repeat(2, minmax(0, 1fr)); } .bento-lg { grid-column: 1 / -1; } }
@media (min-width: 1000px) { .bento { grid-template-columns: repeat(6, minmax(0, 1fr)); } .bento > * { grid-column: span 2; } .bento > .bento-lg { grid-column: span 4; grid-row: span 2; } .bento > .bento-wide { grid-column: span 3; } .bento > .bento-full { grid-column: 1 / -1; } }
.bento-lg { display: grid; gap: var(--space-5); align-content: space-between; }
.bento-lg .h3 { font-size: clamp(1.35rem, 1.1rem + 1vw, 1.75rem); }
.bento-lg .visual, .bento-lg .media-frame { margin-top: var(--space-4); }
.bento-lg .visual-mesh { aspect-ratio: 16 / 9; }
.alt-rows { display: grid; gap: clamp(3rem, 7vw, 6rem); }
.alt-row { display: grid; gap: clamp(1.75rem, 4vw, 4rem); align-items: center; }
@media (min-width: 900px) { .alt-row { grid-template-columns: 1fr 1fr; } .alt-row:nth-child(even) .alt-visual { order: 2; } }
.alt-copy .h3 { font-size: clamp(1.5rem, 1.2rem + 1.1vw, 2rem); margin-block: var(--space-4) var(--space-3); }
.alt-copy p { color: var(--c-text-muted); font-size: var(--fs-lead); max-width: 52ch; }
.split-head { display: grid; gap: clamp(2rem, 5vw, 4rem); }
@media (min-width: 900px) { .split-head { grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr); align-items: start; } .split-head .sec-head { position: sticky; top: 6rem; margin-bottom: 0; } }
.feature-list { display: grid; }
.feature-list li { display: flex; gap: var(--space-4); padding-block: var(--space-5); border-top: 1px solid var(--c-border); }
.feature-list li:last-child { border-bottom: 1px solid var(--c-border); }
.feature-list p { margin-top: var(--space-1); color: var(--c-text-muted); }

/* Steps */
.steps { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); counter-reset: step; }
.step { position: relative; padding: clamp(1.4rem, 2.5vw, 1.8rem); }
.step-num { display: inline-grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: 999px; background: var(--c-primary); color: var(--c-on-primary); font-family: var(--font-heading); font-weight: 700; font-size: 1rem; }
.step .h3 { margin-block: var(--space-4) var(--space-2); }
.step p { color: var(--c-text-muted); }
.step .media-frame { margin-top: var(--space-4); }
@media (min-width: 900px) {
  .steps.is-connected .step:not(:last-child)::after { content: ""; position: absolute; top: calc(clamp(1.4rem, 2.5vw, 1.8rem) + 1.25rem); left: calc(clamp(1.4rem, 2.5vw, 1.8rem) + 3.25rem); right: calc(-1 * var(--space-5) + 0.75rem); height: 2px; background: linear-gradient(90deg, var(--c-primary-soft), var(--c-border)); }
}
.timeline { position: relative; display: grid; gap: var(--space-6); max-width: 46rem; margin-inline: var(--head-mx); }
.timeline-item { position: relative; display: grid; grid-template-columns: 2.5rem minmax(0, 1fr); gap: var(--space-5); }
.timeline-item:not(:last-child)::before { content: ""; position: absolute; left: calc(1.25rem - 1px); top: 2.5rem; bottom: calc(-1 * var(--space-6)); width: 2px; background: linear-gradient(var(--c-primary), var(--c-border)); }
.timeline-item .step-num { position: relative; z-index: 1; box-shadow: 0 0 0 6px var(--c-bg); }
.band-subtle .timeline-item .step-num { box-shadow: 0 0 0 6px var(--c-surface); }
.band-tint .timeline-item .step-num { box-shadow: 0 0 0 6px var(--c-tint); }
.timeline-item .h3 { margin-bottom: var(--space-2); padding-top: 0.3rem; }
.timeline-item p { color: var(--c-text-muted); }
.timeline-item .media-frame { margin-top: var(--space-4); }

/* Testimonials */
.quotes { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); align-items: start; }
.quote { display: flex; flex-direction: column; gap: var(--space-5); padding: clamp(1.4rem, 2.5vw, 1.9rem); }
.quote blockquote p { font-size: var(--fs-body); line-height: 1.65; color: var(--c-text); }
.quote-mark { width: 1.75rem; height: 1.75rem; color: var(--c-primary-text); opacity: 0.9; }
.person { display: flex; align-items: center; gap: var(--space-3); margin-top: auto; }
.person picture, .person img { width: 3rem; height: 3rem; border-radius: 999px; overflow: hidden; }
.avatar { display: inline-grid; place-items: center; width: 3rem; height: 3rem; flex: none; border-radius: 999px; background: linear-gradient(135deg, var(--c-primary-soft), var(--c-accent-soft)); color: var(--c-on-primary-soft); font-weight: 700; font-size: 0.95rem; }
.person-name { font-weight: 600; color: var(--c-text); line-height: 1.3; }
.person-role { font-size: var(--fs-sm); color: var(--c-text-muted); line-height: 1.4; }
.quote-featured { max-width: 52rem; margin-inline: auto; text-align: center; }
.quote-featured blockquote p { font-family: var(--font-heading); font-size: clamp(1.5rem, 1.1rem + 1.6vw, 2.25rem); line-height: 1.3; letter-spacing: -0.015em; font-weight: var(--heading-weight); color: var(--c-text); }
.quote-featured .quote-mark { width: 2.75rem; height: 2.75rem; margin: 0 auto var(--space-5); }
.quote-featured .person { justify-content: center; margin-top: var(--space-6); text-align: left; }
.quote-featured + .quotes { margin-top: clamp(3rem, 6vw, 4.5rem); }

/* Pricing */
.plans { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 17.5rem), 1fr)); align-items: stretch; max-width: 72rem; margin-inline: auto; }
.plan { display: flex; flex-direction: column; gap: var(--space-4); padding: clamp(1.6rem, 3vw, 2.2rem); }
.plan.is-highlight { border-color: var(--c-primary); box-shadow: 0 0 0 1px var(--c-primary), var(--shadow-lg); }
.plan-badge { position: absolute; top: 0; left: 50%; transform: translate(-50%, -50%); padding: 0.3rem 0.8rem; border-radius: 999px; background: var(--c-primary); color: var(--c-on-primary); font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.02em; white-space: nowrap; }
.plan-name { font-size: 1.15rem; }
.plan-price { display: flex; align-items: baseline; gap: 0.35rem; flex-wrap: wrap; }
.plan-price strong { font-family: var(--font-heading); font-size: clamp(2.25rem, 1.8rem + 1.6vw, 2.9rem); line-height: 1.05; letter-spacing: -0.03em; font-weight: 700; color: var(--c-text); }
.plan-price span { color: var(--c-text-muted); font-size: var(--fs-sm); }
.plan-desc { color: var(--c-text-muted); }
.checks { display: grid; gap: var(--space-3); padding-top: var(--space-4); border-top: 1px solid var(--c-border); }
.checks li { display: flex; gap: 0.65rem; align-items: flex-start; }
.checks .icon { width: 1.15rem; height: 1.15rem; margin-top: 0.22em; color: var(--c-primary-text); }
.plan .btn { margin-top: auto; width: 100%; }
.plan-rows { display: grid; max-width: 56rem; margin-inline: var(--head-mx); }
.plan-row { display: grid; gap: var(--space-4); align-items: center; padding: var(--space-5) clamp(1.25rem, 3vw, 2rem); }
.plan-row + .plan-row { margin-top: var(--space-4); }
@media (min-width: 760px) { .plan-row { grid-template-columns: minmax(0, 1.6fr) auto auto; } }
.plan-row .plan-price strong { font-size: 2rem; }
.plan-row .checks { border-top: 0; padding-top: var(--space-2); grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: var(--space-2); font-size: var(--fs-sm); }

/* FAQ */
.faq { display: grid; gap: var(--space-3); }
.faq-item { padding: 0 clamp(1.1rem, 2.5vw, 1.5rem); border-radius: var(--radius); }
.faq-item summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-height: max(var(--touch), 3.75rem); padding-block: var(--space-3); cursor: pointer; list-style: none; font-weight: 600; color: var(--c-text); }
.faq-item summary::-webkit-details-marker { display: none; }
.faq-item summary .icon { width: 1.25rem; height: 1.25rem; color: var(--c-primary-text); transition: transform var(--dur) var(--ease); }
.faq-item[open] summary .icon { transform: rotate(45deg); }
.faq-a { padding-bottom: var(--space-5); color: var(--c-text-muted); max-width: 65ch; }

/* CTA */
.cta-card { position: relative; overflow: hidden; isolation: isolate; padding: clamp(2.5rem, 6vw, 4.5rem) clamp(1.5rem, 5vw, 4rem); border-radius: var(--radius-lg); background: linear-gradient(135deg, var(--c-cta-from), var(--c-cta-to)); color: var(--c-on-primary); text-align: center; box-shadow: var(--shadow-lg); }
.cta-card::before { content: ""; position: absolute; inset: 0; z-index: -1; background: radial-gradient(60% 80% at 100% 0%, rgba(255, 255, 255, 0.18), transparent 60%), radial-gradient(50% 70% at 0% 100%, rgba(0, 0, 0, 0.16), transparent 60%); }
.cta-card .h2 { color: var(--c-on-primary); max-width: 22ch; margin-inline: auto; }
.cta-card .lead { color: var(--c-on-primary); opacity: 1; margin: var(--space-4) auto 0; }
.cta-card .btn-row { justify-content: center; margin-top: var(--space-6); }
.cta-card .btn-primary { background: var(--c-on-primary); color: var(--c-cta-from); box-shadow: var(--shadow); }
.cta-card .btn-primary:hover { background: color-mix(in srgb, var(--c-on-primary) 90%, var(--c-cta-from)); }
.cta-card .btn-secondary { background: transparent; color: var(--c-on-primary); border-color: color-mix(in srgb, var(--c-on-primary) 50%, transparent); }
.cta-card .btn-secondary:hover { background: color-mix(in srgb, var(--c-on-primary) 12%, transparent); }
.cta-card :focus-visible { outline-color: var(--c-on-primary); }
.cta-card.has-bg { background: var(--c-ink); color: var(--c-on-ink); }
.cta-card.has-bg .h2, .cta-card.has-bg .lead { color: var(--c-on-ink); }
.cta-card.has-bg.on-light, .cta-card.has-bg.on-light .h2 { color: var(--c-text); }
.cta-card.has-bg.on-light .lead { color: var(--c-text-muted); }
.cta-card.has-bg.on-light .btn-primary { background: var(--c-primary); color: var(--c-on-primary); }
.cta-card.has-bg.on-light .btn-primary:hover { background: var(--c-primary-hover); }
.cta-card.has-bg.on-light .btn-secondary { color: var(--c-text); border-color: var(--c-border-strong); }
.cta-card.has-bg.on-light :focus-visible { outline-color: var(--c-ring); }
.cta-points { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-5); margin-top: var(--space-5); font-size: var(--fs-sm); font-weight: 500; }
.cta-card .cta-points { justify-content: center; }
.cta-points li { display: inline-flex; align-items: center; gap: 0.4rem; }
.cta-points .icon { width: 1.05rem; height: 1.05rem; }
.cta-split .cta-points { color: var(--c-text-muted); }
.cta-split .cta-points .icon { color: var(--c-primary-text); }
.hero-centered .hero-tags { justify-content: center; }
.hero-media .tag { background: color-mix(in srgb, var(--c-on-ink) 10%, transparent); border-color: color-mix(in srgb, var(--c-on-ink) 25%, transparent); color: var(--c-on-ink); }
.hero-media .tag .icon { color: var(--c-on-ink); }
.cta-split { display: grid; gap: var(--space-6); align-items: center; padding: clamp(2rem, 5vw, 3.25rem); }
@media (min-width: 860px) { .cta-split { grid-template-columns: minmax(0, 1.5fr) auto; } }
.cta-split .lead { margin-top: var(--space-3); }

/* Stats & logos */
.stats { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); }
.stat-value { display: block; font-family: var(--font-heading); font-size: var(--fs-stat); line-height: 1; letter-spacing: -0.035em; font-weight: 700; color: var(--c-text); }
.stat-label { display: block; margin-top: var(--space-3); color: var(--c-text-muted); }
.stats-row { text-align: var(--head-align); }
.stats-row .stat + .stat { border-left: 0; }
@media (min-width: 760px) { .stats-row .stat { padding-inline: var(--space-4); } .stats-row .stat + .stat { border-left: 1px solid var(--c-border); } }
.stat-card { padding: clamp(1.4rem, 2.5vw, 1.9rem); }
.stat-card .stat-value { background: linear-gradient(120deg, var(--c-primary-text), var(--c-accent-text)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.logos-sec { padding-block: clamp(2.5rem, 5vw, 4rem); }
.logos-label { text-align: center; font-size: var(--fs-sm); font-weight: 600; color: var(--c-text-muted); margin-bottom: var(--space-5); }
.logo-row { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: var(--space-5) clamp(2rem, 5vw, 3.5rem); }
.logo-row li { display: flex; align-items: center; min-height: 2.5rem; font-family: var(--font-heading); font-weight: 700; font-size: clamp(1.05rem, 0.95rem + 0.5vw, 1.35rem); letter-spacing: -0.02em; color: var(--c-text-muted); }
.logo-row img { max-height: 40px; width: auto; filter: grayscale(1); opacity: 0.8; }

/* Team & contact */
.team { display: grid; gap: var(--space-5); grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); }
.member { padding: var(--space-5); text-align: center; }
.member .avatar, .member picture, .member img { width: 6rem; height: 6rem; margin-inline: auto; border-radius: 999px; overflow: hidden; }
.member .avatar { font-size: 1.6rem; }
.member .h3 { margin-top: var(--space-4); font-size: 1.1rem; }
.member p { margin-top: var(--space-1); color: var(--c-text-muted); font-size: var(--fs-sm); }
.contact-grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr)); max-width: 64rem; margin-inline: var(--head-mx); }
.contact-card { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-5); min-height: var(--touch); }
.contact-card .label { display: block; font-size: var(--fs-sm); color: var(--c-text-muted); }
.contact-card .value { display: block; font-weight: 600; color: var(--c-text); overflow-wrap: break-word; }
a.contact-card:hover { border-color: var(--c-primary); }

/* Custom */
.custom-media { margin-top: var(--space-7); }
.custom-cards { margin-top: var(--space-7); }

/* Footer */
.site-footer { padding-block: clamp(3rem, 6vw, 4.5rem) var(--space-6); background: var(--c-surface); border-top: 1px solid var(--c-border); font-size: var(--fs-sm); }
.footer-top { display: grid; gap: var(--space-7); }
@media (min-width: 860px) { .footer-top { grid-template-columns: minmax(0, 1.3fr) minmax(0, 2fr); } }
.footer-brand p:not(.brand) { margin-top: var(--space-3); max-width: 36ch; color: var(--c-text-muted); }
.footer-cols { display: grid; gap: var(--space-6); grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); }
.footer-col h2 { font-family: var(--font-body); font-size: var(--fs-xs); font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-text); margin-bottom: var(--space-2); }
.footer-col a { display: inline-flex; align-items: center; min-height: var(--touch); color: var(--c-text-muted); transition: color var(--dur) var(--ease); overflow-wrap: anywhere; }
.footer-col a:hover { color: var(--c-text); }
.footer-bottom { display: flex; flex-wrap: wrap; gap: var(--space-3) var(--space-5); justify-content: space-between; align-items: center; margin-top: var(--space-7); padding-top: var(--space-5); border-top: 1px solid var(--c-border); color: var(--c-text-muted); }
.footer-legal { display: flex; flex-wrap: wrap; gap: 0 var(--space-4); }
.footer-legal a { display: inline-flex; align-items: center; min-height: var(--touch); }
.footer-legal a:hover { color: var(--c-text); }
.footer-copy { color: var(--c-text-muted); }
.footer-minimal { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: center; justify-content: space-between; }
.footer-minimal nav ul { display: flex; flex-wrap: wrap; gap: 0 var(--space-5); }
.footer-minimal nav a { display: inline-flex; align-items: center; min-height: var(--touch); color: var(--c-text-muted); }
.footer-minimal nav a:hover { color: var(--c-text); }

/* Motion */
@media (prefers-reduced-motion: no-preference) {
  html.uf-motion { scroll-behavior: smooth; }
  .uf-motion [data-reveal] { opacity: 0; transform: translateY(var(--reveal-y)); transition: opacity var(--reveal-dur) var(--ease), transform var(--reveal-dur) var(--ease); }
  .uf-motion [data-reveal].is-in { opacity: 1; transform: none; }
  .faq-item[open] .faq-a { animation: faq-open var(--dur) var(--ease); }
  @keyframes faq-open { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
`;
