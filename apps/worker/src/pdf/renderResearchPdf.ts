import { chromium } from "playwright"

export type ResearchDocumentType = "COMPETITOR_ANALYSIS" | "RESEARCH_RATIONALE"

export type Citation = {
  claim?: string
  title?: string
  paperTitle?: string
  source?: string
  url?: string
}

export type ResearchRationaleData = {
  projectName: string
  summary: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  colorRationale: string
  fontPrimary: string
  fontSecondary: string
  typographyRationale: string
  layoutStyle: string
  layoutRationale: string
  imageStyle: string
  imageRationale: string
  citations: Citation[]
}

export type CompetitorEntry = {
  sourceUrl: string
  videoAnalysis?: Record<string, unknown> | null
  extractedContent?: Record<string, unknown> | null
}

export type CompetitorAnalysisData = {
  projectName: string
  competitors: CompetitorEntry[]
}

// PDF content is assembled from LLM-authored and scraped strings, which are
// interpolated into an HTML document — escaping is what keeps a stray "<" in
// a rationale from silently breaking the layout or injecting markup.
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

const BASE_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0D0D0D; line-height: 1.6; }
  h1 { color: #2563EB; font-size: 26px; margin-bottom: 4px; }
  h2 { font-size: 17px; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #E2E8F0; padding-bottom: 5px; }
  h3 { font-size: 14px; margin-top: 18px; margin-bottom: 4px; }
  p { font-size: 13px; margin: 6px 0; }
  .subtitle { color: #64748B; font-size: 12px; margin-top: 0; }
  .citation { color: #64748B; font-size: 11px; font-style: italic; }
  .swatch { display: inline-block; width: 44px; height: 44px; border-radius: 6px; margin-right: 8px; border: 1px solid #E2E8F0; }
  .label { font-size: 10px; color: #64748B; text-transform: uppercase; letter-spacing: 0.06em; }
  ul { font-size: 12px; padding-left: 18px; }
  li { margin: 3px 0; }
  .muted { color: #64748B; font-size: 12px; }
`

function citationText(c: Citation): string {
  const claim = c.claim ?? ""
  const source = c.paperTitle ?? c.title ?? c.source ?? ""
  if (claim && source) return `${esc(claim)} — ${esc(source)}`
  return esc(claim || source || "Untitled citation")
}

export function buildResearchRationaleHtml(report: ResearchRationaleData): string {
  return `<html><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
  <body>
    <h1>${esc(report.projectName)} — Research Rationale</h1>
    <p class="subtitle">Design decisions and the research behind them</p>

    <h2>Summary</h2>
    <p>${esc(report.summary)}</p>

    <h2>Colours</h2>
    <div>
      <span class="swatch" style="background:${esc(report.primaryColor)}"></span>
      <span class="swatch" style="background:${esc(report.secondaryColor)}"></span>
      <span class="swatch" style="background:${esc(report.accentColor)}"></span>
    </div>
    <p class="label">${esc(report.primaryColor)} · ${esc(report.secondaryColor)} · ${esc(report.accentColor)}</p>
    <p>${esc(report.colorRationale)}</p>

    <h2>Typography</h2>
    <p><strong>${esc(report.fontPrimary)}</strong>${report.fontSecondary ? ` · ${esc(report.fontSecondary)}` : ""}</p>
    <p>${esc(report.typographyRationale)}</p>

    <h2>Layout</h2>
    <p><strong>${esc(report.layoutStyle)}</strong></p>
    <p>${esc(report.layoutRationale)}</p>

    <h2>Imagery</h2>
    <p><strong>${esc(report.imageStyle)}</strong></p>
    <p>${esc(report.imageRationale)}</p>

    <h2>All Citations</h2>
    ${
      report.citations.length > 0
        ? `<ul>${report.citations.map((c) => `<li>${citationText(c)}</li>`).join("")}</ul>`
        : `<p class="muted">No citations were recorded for this report.</p>`
    }
  </body></html>`
}

function analysisSection(label: string, value: unknown): string {
  if (value === undefined || value === null) return ""
  const text = Array.isArray(value) ? value.join(" · ") : String(value)
  if (!text.trim()) return ""
  return `<h3>${esc(label)}</h3><p>${esc(text)}</p>`
}

export function buildCompetitorAnalysisHtml(data: CompetitorAnalysisData): string {
  const sections = data.competitors
    .map((c) => {
      const a = c.videoAnalysis ?? {}
      const hasAnalysis = Object.keys(a).length > 0

      return `
      <h2>${esc(c.sourceUrl)}</h2>
      ${
        hasAnalysis
          ? [
              analysisSection("Layout structure", a.layoutStructure),
              analysisSection("Typography", a.typography),
              analysisSection("Spacing", a.spacing),
              analysisSection("Colour palette", a.colorPalette),
              analysisSection("Components", a.components),
              analysisSection("Visual hierarchy", a.visualHierarchy),
              analysisSection("UX patterns", a.uxPatterns),
              analysisSection("Motion patterns", a.motionPatterns),
              analysisSection("Overall impression", a.overallImpression),
            ].join("")
          : `<p class="muted">Only basic scan data was captured for this site — no detailed pattern analysis available.</p>`
      }`
    })
    .join("")

  return `<html><head><meta charset="utf-8"><style>${BASE_STYLES}</style></head>
  <body>
    <h1>${esc(data.projectName)} — Competitor Analysis</h1>
    <p class="subtitle">Design patterns observed across scanned competitor sites</p>
    <p class="muted">These are patterns identified for inspiration and orientation — not a specification to replicate. Copy and imagery are deliberately not reproduced here.</p>
    ${sections || `<p class="muted">No competitor scans are available for this project.</p>`}
  </body></html>`
}

// Uses Playwright's own page.pdf() — the worker already has Chromium, so this
// needs no additional PDF library.
export async function renderResearchPdf(
  type: ResearchDocumentType,
  data: ResearchRationaleData | CompetitorAnalysisData,
): Promise<Buffer> {
  const html =
    type === "COMPETITOR_ANALYSIS"
      ? buildCompetitorAnalysisHtml(data as CompetitorAnalysisData)
      : buildResearchRationaleHtml(data as ResearchRationaleData)

  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    // The HTML is fully self-contained (inline styles, no remote assets), so
    // "load" is sufficient — "networkidle" would just wait out a timeout.
    await page.setContent(html, { waitUntil: "load" })
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "18mm", right: "18mm" },
    })
  } finally {
    await browser.close().catch(() => {})
  }
}
