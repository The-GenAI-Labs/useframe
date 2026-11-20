import type { DesignTokens, SiteSpec, ThemePreset } from "@repo/schemas";
import { THEME_PRESETS } from "@repo/schemas";
import { buildPalette, type ColorMode, type Palette } from "./palette.js";

export type PresetDef = {
  tokens: DesignTokens;
  colorMode: ColorMode;
  headingWeight: number;
  headingTracking: string;
};

export const PRESETS: Record<ThemePreset, PresetDef> = {
  minimal: {
    tokens: {
      radius: "soft",
      shadow: "subtle",
      surface: "flat",
      texture: "none",
      borderWeight: "hairline",
      colorContrast: "balanced",
      density: "airy",
      typeScale: "restrained",
      layoutGrid: "centered",
      motionIntensity: "subtle",
    },
    colorMode: "light",
    headingWeight: 600,
    headingTracking: "-0.025em",
  },
  editorial: {
    tokens: {
      radius: "sharp",
      shadow: "none",
      surface: "flat",
      texture: "paper",
      borderWeight: "regular",
      colorContrast: "high",
      density: "airy",
      typeScale: "editorial",
      layoutGrid: "asymmetric",
      motionIntensity: "subtle",
    },
    colorMode: "light",
    headingWeight: 500,
    headingTracking: "-0.02em",
  },
  bold: {
    tokens: {
      radius: "rounded",
      shadow: "layered",
      surface: "matte",
      texture: "none",
      borderWeight: "none",
      colorContrast: "high",
      density: "balanced",
      typeScale: "dramatic",
      layoutGrid: "centered",
      motionIntensity: "expressive",
    },
    colorMode: "light",
    headingWeight: 700,
    headingTracking: "-0.035em",
  },
  soft: {
    tokens: {
      radius: "pill",
      shadow: "layered",
      surface: "matte",
      texture: "none",
      borderWeight: "none",
      colorContrast: "muted",
      density: "airy",
      typeScale: "restrained",
      layoutGrid: "centered",
      motionIntensity: "standard",
    },
    colorMode: "light",
    headingWeight: 600,
    headingTracking: "-0.02em",
  },
  tech: {
    tokens: {
      radius: "soft",
      shadow: "subtle",
      surface: "glass",
      texture: "grain-subtle",
      borderWeight: "hairline",
      colorContrast: "high",
      density: "balanced",
      typeScale: "editorial",
      layoutGrid: "modular",
      motionIntensity: "standard",
    },
    colorMode: "dark",
    headingWeight: 600,
    headingTracking: "-0.03em",
  },
  warm: {
    tokens: {
      radius: "rounded",
      shadow: "subtle",
      surface: "skeuomorphic",
      texture: "grain-subtle",
      borderWeight: "hairline",
      colorContrast: "balanced",
      density: "balanced",
      typeScale: "editorial",
      layoutGrid: "asymmetric",
      motionIntensity: "standard",
    },
    colorMode: "light",
    headingWeight: 600,
    headingTracking: "-0.015em",
  },
};

export type ResolvedTheme = {
  preset: ThemePreset;
  colorMode: ColorMode;
  tokens: DesignTokens;
  palette: Palette;
  fonts: { heading: string; body: string };
  bodyPx: number;
  touchPx: number;
  headingWeight: number;
  headingTracking: string;
};

export function cssFontName(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9 -]/g, "").trim().slice(0, 60);
  return cleaned || "Inter";
}

function parsePx(value: string | undefined): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(px|rem|em|pt)?/i.exec(value ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "px").toLowerCase();
  return unit === "rem" || unit === "em" ? n * 16 : unit === "pt" ? n * (4 / 3) : n;
}

const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// Old specs carry only the free-text designSystem; map what it says onto tokens.
function legacyTokens(ds: SiteSpec["designSystem"]): Partial<DesignTokens> {
  const out: Partial<DesignTokens> = {};
  const radius = ds.borderRadius?.toLowerCase();
  if (radius === "none") out.radius = "sharp";
  else if (radius === "sm" || radius === "md") out.radius = "soft";
  else if (radius === "lg" || radius === "xl") out.radius = "rounded";
  else if (radius === "full") out.radius = "pill";
  const spacing = ds.spacing?.toLowerCase() ?? "";
  if (/compact|tight|dense/.test(spacing)) out.density = "compact";
  else if (/spacious|airy|loose|relaxed|generous/.test(spacing)) out.density = "airy";
  const motion = ds.animationStyle?.toLowerCase() ?? "";
  if (/bold|dramatic|expressive|playful/.test(motion)) out.motionIntensity = "expressive";
  return out;
}

export function resolveTheme(spec: Pick<SiteSpec, "designSystem" | "designBrief" | "theme">): ResolvedTheme {
  const theme = spec.theme;
  const preset: ThemePreset = theme?.preset && THEME_PRESETS.includes(theme.preset) ? theme.preset : "minimal";
  const def = PRESETS[preset];
  const explicit = Object.fromEntries(
    Object.entries(theme ?? {}).filter(([k, v]) => k !== "preset" && k !== "colorMode" && v !== undefined),
  ) as Partial<DesignTokens>;
  const tokens: DesignTokens = { ...def.tokens, ...(theme ? {} : legacyTokens(spec.designSystem)), ...explicit };
  // Borderless, shadowless flat cards would vanish into the page.
  if (tokens.borderWeight === "none" && (tokens.shadow === "none" || tokens.surface === "flat")) {
    tokens.borderWeight = "hairline";
  }
  const colorMode = theme?.colorMode ?? def.colorMode;
  const ds = spec.designSystem;
  return {
    preset,
    colorMode,
    tokens,
    palette: buildPalette(
      { primary: ds.primaryColor, secondary: ds.secondaryColor, accent: ds.accentColor },
      colorMode,
      tokens.colorContrast,
    ),
    fonts: { heading: cssFontName(ds.fontPrimary ?? ""), body: cssFontName(ds.fontSecondary || ds.fontPrimary || "") },
    bodyPx: Math.round(clampNum(parsePx(spec.designBrief?.typography.minSize) ?? 17, 16, 22)),
    touchPx: Math.round(clampNum(parsePx(spec.designBrief?.accessibility.touchTarget) ?? 44, 44, 64)),
    headingWeight: def.headingWeight,
    headingTracking: def.headingTracking,
  };
}

export function googleFontsHref(theme: ResolvedTheme): string {
  const families = [...new Set([theme.fonts.heading, theme.fonts.body])]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
