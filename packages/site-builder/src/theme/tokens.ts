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
