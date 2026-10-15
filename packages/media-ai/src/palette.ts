import type { VisualSystem } from "./schemas.js"

export type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const h = m[1]!.length === 3 ? m[1]!.replace(/./g, (c) => c + c) : m[1]!
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function toLab([r, g, b]: Rgb): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

export function deltaE76(a: Rgb, b: Rgb): number {
  const [l1, a1, b1] = toLab(a)
  const [l2, a2, b2] = toLab(b)
  return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2)
}

export function minDeltaE(color: Rgb, palette: readonly Rgb[]): number {
  return palette.reduce((min, p) => Math.min(min, deltaE76(color, p)), Infinity)
}

// Neutrals are always allowed: lighting and shadows need them.
const NEUTRALS: Rgb[] = [
  [0, 0, 0],
  [255, 255, 255],
  [128, 128, 128],
]

const COLOR_TOKEN = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}[^)]*\)/gi

export function colorsIn(text: string): Rgb[] {
  return (text.match(COLOR_TOKEN) ?? []).flatMap((token) => {
    if (token.startsWith("#")) {
      const rgb = hexToRgb(token)
      return rgb ? [rgb] : []
    }
    const [r, g, b] = (token.match(/\d{1,3}/g) ?? []).slice(0, 3).map(Number)
    return r !== undefined && g !== undefined && b !== undefined ? [[r, g, b] as Rgb] : []
  })
}

export const PALETTE_TOLERANCE = 12

// A visual system may describe light and mood but never introduce a colour the
// brief's palette does not contain (explicit hex or rgb values are checked).
export function offPaletteColors(vs: VisualSystem, paletteHex: readonly string[], tolerance = PALETTE_TOLERANCE): string[] {
  const palette = [...paletteHex.flatMap((h) => (hexToRgb(h) ? [hexToRgb(h)!] : [])), ...NEUTRALS]
  // doNot is excluded: naming a colour there forbids it rather than introducing it.
  const fields = [vs.lighting, vs.lens, vs.texture, vs.recurringMotif, vs.colorUsage, ...vs.compositionRules]
  const offenders: string[] = []
  for (const field of fields) {
    for (const token of field.match(COLOR_TOKEN) ?? []) {
      const rgb = colorsIn(token)[0]
      if (rgb && minDeltaE(rgb, palette) > tolerance) offenders.push(token)
    }
  }
  return offenders
}
