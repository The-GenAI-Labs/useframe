import type { DesignTokens } from "@repo/schemas";
import { contrastRatio, ensureContrast, hexToOklch, isHexColor, oklchToHex, type Oklch } from "./color.js";

export type ColorMode = "light" | "dark";

export type Palette = {
  bg: string;
  surface: string;
  tint: string;
  card: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryHover: string;
  onPrimary: string;
  primaryText: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  secondary: string;
  secondarySoft: string;
  ctaFrom: string;
  ctaTo: string;
  ink: string;
  onInk: string;
  onInkMuted: string;
};

export const AA_TEXT = 4.5;

const WHITE = "#ffffff";

function brand(value: string | undefined, fallback: string): Oklch {
  return hexToOklch(isHexColor(value) ? value : fallback);
}

// A filled colour plus the foreground that reads on it; the fill moves away
// from that foreground until body-size text passes AA.
function filled(base: Oklch, darkFg: string): { fill: string; fg: string; dir: "darker" | "lighter" } {
  const hex = oklchToHex(base);
  const onWhite = contrastRatio(hex, WHITE);
  const onDark = contrastRatio(hex, darkFg);
  if (onWhite >= onDark) return { fill: ensureContrast(base, [WHITE], AA_TEXT, "darker"), fg: WHITE, dir: "darker" };
  return { fill: ensureContrast(base, [darkFg], AA_TEXT, "lighter"), fg: darkFg, dir: "lighter" };
}

export function buildPalette(
  colors: { primary?: string; secondary?: string; accent?: string },
  mode: ColorMode,
  contrast: DesignTokens["colorContrast"],
): Palette {
  const p = brand(colors.primary, "#2563EB");
  const s = brand(colors.secondary, "#64748B");
  const a = brand(colors.accent, "#F97316");
  const neutralChroma = contrast === "high" ? 0.006 : contrast === "muted" ? 0.014 : 0.01;
  const n = (l: number, c = Math.min(neutralChroma, p.c * 0.2)) => oklchToHex({ l, c, h: p.h });
  const dark = mode === "dark";

  const bg = dark ? n(0.165) : n(0.993, 0.003);
  const surface = dark ? n(0.195) : n(0.972);
  const tint = dark
    ? oklchToHex({ l: 0.205, c: Math.min(p.c, 0.12) * 0.28, h: p.h })
    : oklchToHex({ l: 0.962, c: Math.min(p.c, 0.12) * 0.22, h: p.h });
  const card = dark ? n(0.215) : WHITE;
  const backgrounds = [bg, surface, tint, card];
  const textL = { muted: dark ? 0.9 : 0.29, balanced: dark ? 0.95 : 0.22, high: dark ? 0.985 : 0.16 }[contrast];
  const text = ensureContrast({ l: textL, c: neutralChroma, h: p.h }, backgrounds, 7, dark ? "lighter" : "darker");
  const textMuted = ensureContrast(
    { l: dark ? 0.66 : 0.52, c: neutralChroma * 1.4, h: p.h },
    backgrounds,
    AA_TEXT + 0.1,
    dark ? "lighter" : "darker",
  );
  const borderL = { muted: dark ? 0.26 : 0.925, balanced: dark ? 0.29 : 0.9, high: dark ? 0.34 : 0.85 }[contrast];
  const border = n(borderL);
  const borderStrong = n(dark ? borderL + 0.08 : borderL - 0.1);

  const darkFg = dark ? n(0.16) : n(0.18);
  const primaryFill = filled(p, darkFg);
  const primaryHover = ensureContrast(
    { ...hexToOklch(primaryFill.fill), l: hexToOklch(primaryFill.fill).l + (primaryFill.dir === "darker" ? -0.05 : 0.05) },
    [primaryFill.fg],
    AA_TEXT,
    primaryFill.dir,
  );
  const ctaBase = hexToOklch(primaryFill.fill);
  const ctaTo = ensureContrast(
    { l: ctaBase.l + (primaryFill.dir === "darker" ? -0.08 : 0.06), c: Math.max(ctaBase.c, a.c * 0.6), h: (ctaBase.h + 28) % 360 },
    [primaryFill.fg],
    AA_TEXT,
    primaryFill.dir,
  );
  const readable = (color: Oklch) => ensureContrast(color, backgrounds, AA_TEXT + 0.1, dark ? "lighter" : "darker");
  const soft = (color: Oklch) =>
    oklchToHex(dark ? { l: 0.3, c: Math.min(color.c, 0.14) * 0.55, h: color.h } : { l: 0.945, c: Math.min(color.c, 0.14) * 0.35, h: color.h });
  const primarySoft = soft(p);
  const ink = oklchToHex({ l: 0.2, c: Math.min(p.c, 0.1) * 0.55, h: p.h });

  return {
    bg,
    surface,
    tint,
    card,
    border,
    borderStrong,
    text,
    textMuted,
    primary: primaryFill.fill,
    primaryHover,
    onPrimary: primaryFill.fg,
    primaryText: readable(p),
    primarySoft,
    onPrimarySoft: ensureContrast(p, [primarySoft], AA_TEXT, dark ? "lighter" : "darker"),
    accent: oklchToHex(a),
    accentText: readable(a),
    accentSoft: soft(a),
    secondary: oklchToHex(s),
    secondarySoft: soft(s),
    ctaFrom: primaryFill.fill,
    ctaTo,
    ink,
    onInk: ensureContrast({ l: 0.98, c: 0.005, h: p.h }, [ink], 7, "lighter"),
    onInkMuted: ensureContrast({ l: 0.82, c: 0.01, h: p.h }, [ink], AA_TEXT + 0.1, "lighter"),
  };
}

// Every text/background pair the stylesheet actually uses.
export function contrastPairs(pal: Palette): { name: string; fg: string; bg: string; min: number }[] {
  const pairs: { name: string; fg: string; bg: string; min: number }[] = [];
  for (const [bgName, bg] of [
    ["bg", pal.bg],
    ["surface", pal.surface],
    ["tint", pal.tint],
    ["card", pal.card],
  ] as const) {
    pairs.push({ name: `text/${bgName}`, fg: pal.text, bg, min: AA_TEXT });
    pairs.push({ name: `textMuted/${bgName}`, fg: pal.textMuted, bg, min: AA_TEXT });
    pairs.push({ name: `primaryText/${bgName}`, fg: pal.primaryText, bg, min: AA_TEXT });
    pairs.push({ name: `accentText/${bgName}`, fg: pal.accentText, bg, min: AA_TEXT });
  }
  pairs.push(
    { name: "onPrimary/primary", fg: pal.onPrimary, bg: pal.primary, min: AA_TEXT },
    { name: "onPrimary/primaryHover", fg: pal.onPrimary, bg: pal.primaryHover, min: AA_TEXT },
    { name: "onPrimary/ctaFrom", fg: pal.onPrimary, bg: pal.ctaFrom, min: AA_TEXT },
    { name: "onPrimary/ctaTo", fg: pal.onPrimary, bg: pal.ctaTo, min: AA_TEXT },
    { name: "onPrimarySoft/primarySoft", fg: pal.onPrimarySoft, bg: pal.primarySoft, min: AA_TEXT },
    { name: "onInk/ink", fg: pal.onInk, bg: pal.ink, min: AA_TEXT },
    { name: "onInkMuted/ink", fg: pal.onInkMuted, bg: pal.ink, min: AA_TEXT },
  );
  return pairs;
}
