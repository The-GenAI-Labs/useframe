function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "").trim()
  const full =
    normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized

  const int = parseInt(full, 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!
}

/**
 * WCAG relative contrast ratio between two hex colors, per the standard
 * formula: (L1 + 0.05) / (L2 + 0.05) where L1 is the lighter luminance.
 */
export function wcagContrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(hexToRgb(foreground))
  const l2 = relativeLuminance(hexToRgb(background))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}
