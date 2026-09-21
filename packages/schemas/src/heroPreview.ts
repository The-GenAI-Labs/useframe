import type { DesignBrief } from "./designBrief.schema.js"

// A hero-section preview for the two-candidate picker, rendered as inline SVG
// rather than a Playwright screenshot. The preview is one section — a colour
// field, a headline, a sub-line and a button — so a browser buys nothing here
// and would cost a browser binary in the orchestrator (which has none), a
// launch per render, and somewhere to put the resulting PNG. An SVG data URL
// is built synchronously, needs no storage, and is discarded as soon as the
// user picks.

const PREVIEW_WIDTH = 1200
const PREVIEW_HEIGHT = 630

// SVG is XML — an unescaped & or < from LLM-authored brief text (product
// names, tone lines) would produce a document the browser refuses to render.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

// SVG <text> does not wrap. Break into lines on word boundaries using an
// approximate character budget for the given font size.
function wrapText(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
    if (lines.length === maxLines) break
  }

  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length === 0) return [""]

  // Ellipsize if we ran out of room mid-sentence.
  const consumed = lines.join(" ").split(/\s+/).length
  if (consumed < words.length) {
    const last = lines[lines.length - 1]!
    lines[lines.length - 1] = `${last.slice(0, Math.max(0, maxChars - 1))}…`
  }
  return lines
}

// Readable foreground for a background colour, so a light `primary` doesn't
// produce white-on-white. Falls back to white for anything unparseable.
function readableTextColor(background: string): string {
  const hex = background.trim().replace(/^#/, "")
  const full =
    hex.length === 3
      ? hex.split("").map((c) => c + c).join("")
      : hex
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return "#FFFFFF"

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  // Relative luminance (sRGB coefficients).
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? "#111827" : "#FFFFFF"
}

export function buildHeroPreviewSvg(brief: DesignBrief): string {
  const bg = brief.colors.primary
  const accent = brief.colors.accent
  const fg = readableTextColor(bg)
  const accentFg = readableTextColor(accent)
  const font = `${brief.typography.primary}, system-ui, -apple-system, Segoe UI, sans-serif`

  const headlineLines = wrapText(brief.product, 28, 2)
  const toneLines = wrapText(brief.brand.tone, 46, 2)

  const headlineStart = 210
  const headlineStep = 78
  const toneStart = headlineStart + headlineLines.length * headlineStep + 24
  const toneStep = 38
  const buttonY = toneStart + toneLines.length * toneStep + 36

  const headlineTspans = headlineLines
    .map(
      (line, i) =>
        `<text x="80" y="${headlineStart + i * headlineStep}" font-family="${escapeXml(font)}" font-size="66" font-weight="700" fill="${escapeXml(fg)}">${escapeXml(line)}</text>`,
    )
    .join("")

  const toneTspans = toneLines
    .map(
      (line, i) =>
        `<text x="80" y="${toneStart + i * toneStep}" font-family="${escapeXml(font)}" font-size="26" fill="${escapeXml(fg)}" opacity="0.85">${escapeXml(line)}</text>`,
    )
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}" role="img">
  <rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${escapeXml(bg)}"/>
  <rect x="80" y="96" width="120" height="8" rx="4" fill="${escapeXml(accent)}"/>
  ${headlineTspans}
  ${toneTspans}
  <rect x="80" y="${buttonY}" width="240" height="64" rx="12" fill="${escapeXml(accent)}"/>
  <text x="200" y="${buttonY + 41}" font-family="${escapeXml(font)}" font-size="24" font-weight="600" fill="${escapeXml(accentFg)}" text-anchor="middle">Get started</text>
  <rect x="${PREVIEW_WIDTH - 360}" y="120" width="280" height="390" rx="20" fill="${escapeXml(brief.colors.secondary)}" opacity="0.5"/>
</svg>`
}

// Data URL so the preview travels inside the SSE event / API response and
// needs no bucket, no signed URL and no cleanup job.
export function buildHeroPreviewDataUrl(brief: DesignBrief): string {
  const svg = buildHeroPreviewSvg(brief)
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`
}
