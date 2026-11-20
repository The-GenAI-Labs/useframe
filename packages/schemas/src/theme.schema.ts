import { z } from "zod";

export const DesignTokensSchema = z.object({
  radius: z.enum(["sharp", "soft", "rounded", "pill"]),
  shadow: z.enum(["none", "subtle", "layered", "heavy"]),
  surface: z.enum(["flat", "matte", "glass", "skeuomorphic"]),
  texture: z.enum(["none", "grain-subtle", "grain-heavy", "paper"]),
  borderWeight: z.enum(["none", "hairline", "regular", "heavy"]),
  colorContrast: z.enum(["muted", "balanced", "high"]),
  density: z.enum(["airy", "balanced", "compact"]),
  typeScale: z.enum(["restrained", "editorial", "dramatic"]),
  layoutGrid: z.enum(["centered", "asymmetric", "modular", "narrow", "horizontal"]),
  motionIntensity: z.enum(["subtle", "standard", "expressive"]),
});
export type DesignTokens = z.infer<typeof DesignTokensSchema>;

export const PartialDesignTokensSchema = DesignTokensSchema.partial().strict();
export type PartialDesignTokens = z.infer<typeof PartialDesignTokensSchema>;

export const THEME_PRESETS = ["minimal", "editorial", "bold", "soft", "tech", "warm"] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

// Every field is optional so a partial theme from a model still parses; the
// renderer fills gaps from the preset, then from the legacy designSystem.
export const SiteThemeSchema = z.object({
  preset: z.enum(THEME_PRESETS).optional(),
  colorMode: z.enum(["light", "dark"]).optional(),
  ...DesignTokensSchema.partial().shape,
});
export type SiteTheme = z.infer<typeof SiteThemeSchema>;

export const SECTION_VARIANTS = {
  HEADER: ["bar", "centered"],
  HERO: ["centered", "split", "editorial", "media"],
  LOGOS: ["row"],
  STATS: ["row", "cards"],
  FEATURES: ["grid", "bento", "alternating", "list"],
  HOW_IT_WORKS: ["steps", "timeline"],
  TESTIMONIALS: ["cards", "featured"],
  PRICING: ["tiers", "simple"],
  FAQ: ["accordion", "two-column"],
  CTA: ["banner", "split"],
  TEAM: ["grid"],
  CONTACT: ["simple"],
  FOOTER: ["columns", "minimal"],
  CUSTOM: ["prose"],
} as const;

export type SectionVariantMap = typeof SECTION_VARIANTS;
export type SectionVariant = SectionVariantMap[keyof SectionVariantMap][number];

export const ALL_SECTION_VARIANTS = [...new Set(Object.values(SECTION_VARIANTS).flat())] as [
  SectionVariant,
  ...SectionVariant[],
];
