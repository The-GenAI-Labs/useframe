import {
  fontPairingById,
  type DesignBrief,
  type DesignTokens,
  type FontPairingId,
  type SiteSpec,
  type SiteTheme,
  type ThemePreset,
} from "@repo/schemas"
import { PRESETS } from "@repo/site-builder"
import { wcagContrastRatio } from "./contrast.js"

export type DesignChoice = {
  primaryColor: string
  secondaryColor: string
  accentColor: string
  fontPairing: FontPairingId
  theme: SiteTheme
}

const choice = (primaryColor: string, secondaryColor: string, accentColor: string, fontPairing: FontPairingId, preset: ThemePreset, colorMode: "light" | "dark" = "light"): DesignChoice => ({
  primaryColor,
  secondaryColor,
  accentColor,
  fontPairing,
  theme: { preset, colorMode },
})

// Curated, niche-appropriate defaults used when the model cannot produce a
// valid choice. Deliberately no indigo.
const NICHE_DEFAULTS: Record<string, DesignChoice> = {
  FINTECH: choice("#0B6E4F", "#E6F4EE", "#F2A541", "manrope-inter", "minimal"),
  SAAS_B2B: choice("#2453D4", "#E8EEFB", "#F97316", "plus-jakarta-inter", "minimal"),
  HEALTH_WELLNESS: choice("#0F766E", "#E3F4F2", "#EA580C", "lexend-source-sans", "soft"),
  EDTECH: choice("#2563EB", "#FEF3C7", "#F59E0B", "plus-jakarta-inter", "soft"),
  KIDS: choice("#7C3AED", "#D1FAE5", "#F59E0B", "fredoka-nunito", "soft"),
  ECOMMERCE: choice("#9F1239", "#FCE7EF", "#0E7490", "fraunces-inter", "warm"),
  FOOD_LIFESTYLE: choice("#B45309", "#FEF3E2", "#166534", "fraunces-inter", "warm"),
  FITNESS: choice("#DC2626", "#FEE2E2", "#F59E0B", "outfit-inter", "bold"),
  LUXURY: choice("#1C1917", "#E7E5E4", "#A16207", "cormorant-jost", "editorial"),
  MEDITATION: choice("#4D7C6F", "#EEF3EF", "#C08457", "lora-work-sans", "soft"),
  OTHER: choice("#0F766E", "#E6F2F1", "#D97706", "manrope-inter", "minimal"),
}

export function fallbackDesign(niche: string | undefined): DesignChoice {
  return NICHE_DEFAULTS[niche ?? ""] ?? NICHE_DEFAULTS.OTHER!
}

function hue(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (h * 60 + 360) % 360, s, l }
}

// Checks the model's colours: a readable primary, a distinct accent, and not
// the old default indigo.
export function colorIssues(c: Pick<DesignChoice, "primaryColor" | "secondaryColor" | "accentColor">): string[] {
  const issues: string[] = []
  const bestText = Math.max(wcagContrastRatio(c.primaryColor, "#FFFFFF"), wcagContrastRatio(c.primaryColor, "#111111"))
  if (bestText < 4.5) issues.push(`primaryColor ${c.primaryColor} cannot carry readable button text; pick a deeper or lighter shade`)
  const p = hue(c.primaryColor)
  const a = hue(c.accentColor)
  const hueGap = Math.min(Math.abs(p.h - a.h), 360 - Math.abs(p.h - a.h))
  if (hueGap < 25 && Math.abs(p.l - a.l) < 0.2) issues.push("accentColor must be clearly distinct from primaryColor")
  if (c.primaryColor.toLowerCase() === "#6366f1") issues.push("do not use the generic indigo #6366F1; choose a colour that suits this niche")
  return issues
}

const PERSONALITY_PRESETS: [RegExp, ThemePreset][] = [
  [/luxur|premium|elegant|refined|sophisticat|exclusive/i, "editorial"],
  [/bold|energetic|athletic|powerful|loud|confident/i, "bold"],
  [/playful|friendly|warm|caring|gentle|kind|fun/i, "soft"],
  [/technical|developer|precise|futur|innovative|data/i, "tech"],
  [/artisan|craft|organic|rustic|human|earthy|natural/i, "warm"],
]

// Briefs made before themes existed: derive one from personality, density and motion.
export function themeFromBrief(brief: DesignBrief, niche?: string): SiteTheme {
  if (brief.theme?.preset) return brief.theme
  const text = `${brief.brand.personality} ${brief.brand.tone}`
  const preset = PERSONALITY_PRESETS.find(([re]) => re.test(text))?.[1] ?? fallbackDesign(niche).theme.preset ?? "minimal"
  const tokens: Partial<DesignTokens> = {}
  if (/low|minimal|airy|spacious/i.test(brief.density)) tokens.density = "airy"
  else if (/high|compact|dense/i.test(brief.density)) tokens.density = "compact"
  if (/none|minimal|subtle|reduced/i.test(brief.motion)) tokens.motionIntensity = "subtle"
  else if (/expressive|energetic|bold|high/i.test(brief.motion)) tokens.motionIntensity = "expressive"
  if (/7(\.0)?:1|aaa/i.test(brief.accessibility.minContrast)) tokens.colorContrast = "high"
  return { ...brief.theme, preset, ...tokens }
}

export function fontsFor(pairing: string | undefined, fallback: { primary: string; secondary: string }): { fontPrimary: string; fontSecondary: string } {
  const p = fontPairingById(pairing)
  return p ? { fontPrimary: p.heading, fontSecondary: p.body } : { fontPrimary: fallback.primary, fontSecondary: fallback.secondary }
}

const RADIUS_BY_TOKEN: Record<DesignTokens["radius"], string> = { sharp: "none", soft: "md", rounded: "lg", pill: "full" }

export function designSystemFrom(c: DesignChoice): SiteSpec["designSystem"] {
  const pairing = fontPairingById(c.fontPairing)!
  const tokens = { ...PRESETS[c.theme.preset ?? "minimal"].tokens, ...c.theme }
  return {
    primaryColor: c.primaryColor,
    secondaryColor: c.secondaryColor,
    accentColor: c.accentColor,
    fontPrimary: pairing.heading,
    fontSecondary: pairing.body,
    spacing: tokens.density === "airy" ? "spacious" : tokens.density === "compact" ? "compact" : "comfortable",
    borderRadius: RADIUS_BY_TOKEN[tokens.radius],
    animationStyle: tokens.motionIntensity,
  }
}
