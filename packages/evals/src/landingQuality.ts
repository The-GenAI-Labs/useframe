// pnpm --filter @repo/evals eval:landing -- --before <file> --after <file> [--paid <file>] [--out report.md]
// Scores generated landing specs (from apps/orchestrator-service/scripts/evalLanding.ts).
import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"
import { fileURLToPath } from "node:url"
import { checkSpecQuality, isPlaceholder, SiteSpecSchema, type SiteSpec } from "@repo/schemas"
import { contrastPairs, contrastRatio, resolveTheme } from "@repo/site-builder"

type Usage = { calls: number; inputTokens: number; outputTokens: number }
type Result = { id: string; ms: number; usage: Usage; spec?: Partial<SiteSpec>; error?: string; judge?: Record<string, number> | null }
type Run = { variant: string; tier: string; results: Result[] }
type Brief = { id: string; name: string; startupIdea: string; targetAudience: string; differentiator?: string }

export type SiteScore = {
  id: string
  ok: boolean
  schemaValid: boolean
  placeholders: number
  emptySections: number
  limitViolations: number
  bannedPhrases: number
  inventedProof: number
  repeatedHeadlines: number
  adjacentRepeats: number
  ctaDrift: number
  customSections: number
  sectionOrder: string
  distinctVariants: number
  contrastPass: boolean
  brandColourReadable: boolean
  judge: number | null
}

const here = path.dirname(fileURLToPath(import.meta.url))
const MIN_DISTINCT_ORDERS = 4

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value)
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out))
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out))
  return out
}

export function scoreSite(result: Result, brief: Brief): SiteScore {
  const empty: SiteScore = {
    id: result.id, ok: false, schemaValid: false, placeholders: 0, emptySections: 0, limitViolations: 0, bannedPhrases: 0,
    inventedProof: 0, repeatedHeadlines: 0, adjacentRepeats: 0, ctaDrift: 0, customSections: 0, sectionOrder: "", distinctVariants: 0, contrastPass: false, brandColourReadable: false, judge: null,
  }
  const spec = result.spec
  if (!spec?.pages || !spec.designSystem) return empty
  const facts = [brief.name, brief.startupIdea, brief.targetAudience, brief.differentiator].filter(Boolean).join("\n")
  const issues = checkSpecQuality({ pages: spec.pages }, { facts })
  const count = (...codes: string[]) => issues.filter((i) => codes.includes(i.code)).length
  const sections = spec.pages.flatMap((p) => p.sections)
  const contentText = strings(sections.map((s) => s.content))
  const theme = resolveTheme(spec as SiteSpec)
  const primaryReadable = Math.max(contrastRatio(spec.designSystem.primaryColor, "#ffffff"), contrastRatio(spec.designSystem.primaryColor, "#111111"))
  const judgeScores = result.judge ? Object.values(result.judge) : []
  return {
    id: result.id,
    ok: true,
    schemaValid: SiteSpecSchema.safeParse({ ...spec, siteType: spec.siteType ?? "SINGLE_PAGE", copyFramework: spec.copyFramework ?? "AIDA", citations: spec.citations ?? [] }).success,
    placeholders: contentText.filter(isPlaceholder).length,
    emptySections: sections.filter((s) => s.type !== "HEADER" && s.type !== "FOOTER" && !s.content?.headline && !s.content?.items?.length && !s.content?.stats?.length && !s.content?.logos?.length && !s.content?.plans?.length).length,
    limitViolations: count("limit", "items"),
    bannedPhrases: count("banned"),
    inventedProof: count("invented_proof"),
    repeatedHeadlines: count("duplicate_headline", "repeated_opening"),
    adjacentRepeats: count("adjacent_variant"),
    ctaDrift: count("cta_inconsistent"),
    customSections: sections.filter((s) => s.type === "CUSTOM").length,
    sectionOrder: (spec.pages.find((p) => p.type === "HOME") ?? spec.pages[0]!).sections.map((s) => s.type).filter((t) => t !== "HEADER" && t !== "FOOTER").join(" > "),
    distinctVariants: new Set(sections.map((s) => s.variant).filter(Boolean)).size,
    contrastPass: contrastPairs(theme.palette).every((p) => contrastRatio(p.fg, p.bg) >= p.min),
    brandColourReadable: primaryReadable >= 4.5,
    judge: judgeScores.length ? judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length : null,
  }
}

const sum = (rows: SiteScore[], key: keyof SiteScore) => rows.reduce((a, r) => a + Number(r[key] ?? 0), 0)
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)
const median = (xs: number[]) => {
  const s = [...xs].sort((x, y) => x - y)
  if (!s.length) return NaN
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2
}
const fmt = (n: number, digits = 1) => (Number.isFinite(n) ? n.toFixed(digits) : "–")

function usageLine(run: Run): string {
  const ok = run.results.filter((r) => !r.error)
  const calls = mean(ok.map((r) => r.usage.calls))
  const input = mean(ok.map((r) => r.usage.inputTokens))
  const output = mean(ok.map((r) => r.usage.outputTokens))
  const secs = ok.map((r) => r.ms / 1000)
  return `${run.variant} (${run.tier}): ${fmt(calls)} model calls, ${fmt(input, 0)} input + ${fmt(output, 0)} output tokens on average; ${fmt(median(secs), 0)} s median (${fmt(mean(secs), 0)} s mean) per site`
}

function main() {
  const { values } = parseArgs({ options: { before: { type: "string" }, after: { type: "string" }, paid: { type: "string" }, out: { type: "string" } } })
  const briefs = JSON.parse(readFileSync(path.join(here, "../datasets/landing-briefs.json"), "utf8")) as Brief[]
  const load = (file?: string) => (file ? (JSON.parse(readFileSync(file, "utf8")) as Run) : null)
  const before = load(values.before)
  const after = load(values.after)
  const paid = load(values.paid)
  const score = (run: Run | null) => (run ? run.results.map((r) => scoreSite(r, briefs.find((b) => b.id === r.id)!)) : [])
  const b = score(before)
  const a = score(after)
  const p = score(paid)

  const lines: string[] = ["# Landing quality eval", ""]
  lines.push("| Brief | Judge before | Judge after | Problems before | Problems after | Variants before | Variants after |", "|---|---|---|---|---|---|---|")
  const problems = (s?: SiteScore) => (s?.ok ? s.placeholders + s.emptySections + s.limitViolations + s.bannedPhrases + s.inventedProof + s.repeatedHeadlines + s.adjacentRepeats + s.ctaDrift : NaN)
  for (const brief of briefs) {
    const sb = b.find((s) => s.id === brief.id)
    const sa = a.find((s) => s.id === brief.id)
    if (!sb && !sa) continue
    lines.push(`| ${brief.id} | ${fmt(sb?.judge ?? NaN)} | ${fmt(sa?.judge ?? NaN)} | ${fmt(problems(sb), 0)} | ${fmt(problems(sa), 0)} | ${sb?.distinctVariants ?? "–"} | ${sa?.distinctVariants ?? "–"} |`)
  }
  const totals = (rows: SiteScore[]) => {
    const ok = rows.filter((r) => r.ok)
    return {
      sites: `${ok.length}/${rows.length}`,
      schema: `${ok.filter((r) => r.schemaValid).length}/${ok.length}`,
      placeholders: sum(ok, "placeholders"),
      empty: sum(ok, "emptySections"),
      limits: sum(ok, "limitViolations"),
      banned: sum(ok, "bannedPhrases"),
      proof: sum(ok, "inventedProof"),
      repeats: sum(ok, "repeatedHeadlines"),
      adjacent: sum(ok, "adjacentRepeats"),
      cta: `${sum(ok, "ctaDrift")}/${ok.length}`,
      custom: sum(ok, "customSections"),
      orders: `${new Set(ok.map((r) => r.sectionOrder)).size}${ok.length >= 10 ? (new Set(ok.map((r) => r.sectionOrder)).size >= MIN_DISTINCT_ORDERS ? " (pass)" : " (fail)") : ""}`,
      variants: fmt(mean(ok.map((r) => r.distinctVariants))),
      contrast: `${ok.filter((r) => r.contrastPass).length}/${ok.length}`,
      brand: `${ok.filter((r) => r.brandColourReadable).length}/${ok.length}`,
      judge: fmt(mean(ok.map((r) => r.judge).filter((j): j is number => j !== null))),
    }
  }
  const cols: [string, keyof ReturnType<typeof totals>][] = [
    ["Sites generated", "sites"], ["Schema valid", "schema"], ["Placeholder strings", "placeholders"], ["Empty sections", "empty"],
    ["Limit violations", "limits"], ["Banned phrases", "banned"], ["Invented proof", "proof"], ["Repeated headlines/openings", "repeats"],
    ["Adjacent layout repeats", "adjacent"], ["Sites with differing primary CTA labels", "cta"], ["CUSTOM sections (no brief content exists)", "custom"],
    [`Distinct home-page section orders (target ≥ ${MIN_DISTINCT_ORDERS})`, "orders"], ["Distinct variants per site", "variants"], ["Contrast pass (rendered)", "contrast"],
    ["Brand colour carries readable text", "brand"], ["LLM judge (1-10)", "judge"],
  ]
  const tb = totals(b)
  const ta = totals(a)
  const tp = totals(p)
  lines.push("", `| Check | Before (${before?.tier ?? "–"}) | After (${after?.tier ?? "–"}) |${paid ? ` After (${paid.tier}, ${p.length} briefs) |` : ""}`, `|---|---|---|${paid ? "---|" : ""}`)
  for (const [label, key] of cols) lines.push(`| ${label} | ${tb[key]} | ${ta[key]} |${paid ? ` ${tp[key]} |` : ""}`)
  lines.push("", "Home-page section order per brief (after):")
  for (const s of a) lines.push(`- ${s.id}: ${s.sectionOrder || "–"}`)
  lines.push("", "Cost per site:")
  for (const run of [before, after, paid]) if (run) lines.push(`- ${usageLine(run)}`)
  for (const run of [before, after, paid]) {
    for (const r of run?.results ?? []) if (r.error) lines.push(`- ${run!.variant}/${r.id} failed: ${r.error.slice(0, 160)}`)
  }
  const report = lines.join("\n")
  if (values.out) writeFileSync(values.out, `${report}\n`)
  console.log(report)
}

main()
