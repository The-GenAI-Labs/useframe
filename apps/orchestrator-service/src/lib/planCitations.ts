import { prisma, type Prisma } from "@useframe/db"
import {
  briefCitedFindingIds,
  NicheCategoryEnum,
  type CitationToSave,
  type DecisionArea,
  type DesignBrief,
  type ResearchReportData,
  type RetrievalResult,
} from "@repo/schemas"
import type { PlannerRetrievalResult } from "@/prompts/planner.prompt.js"
import { retrieveForProject, saveCitations } from "@/lib/researchService.js"

const LEGACY_DECISION_AREAS: Record<string, DecisionArea> = {
  primary_color: "COLOR",
  accent_color: "COLOR",
  secondary_color: "COLOR",
  typography: "TYPOGRAPHY",
  conversion_structure: "CONVERSION",
  layout: "LAYOUT",
  accessibility: "ACCESSIBILITY",
  motion: "MOTION",
}

type ReportCreate = Omit<Prisma.ResearchReportUncheckedCreateInput, "projectId">

export async function retrieveCorpus(input: {
  projectId: string
  rawIdea: string
  niche: string
  answers: Record<string, string | undefined>
}): Promise<RetrievalResult["areas"]> {
  const niche = NicheCategoryEnum.safeParse(input.niche)
  try {
    const result = await retrieveForProject({
      projectId: input.projectId,
      rawIdea: input.rawIdea.slice(0, 4000),
      niche: niche.success ? niche.data : "OTHER",
      intakeAnswers: Object.fromEntries(
        Object.entries(input.answers).flatMap(([k, v]) => (v?.trim() ? [[k, v.trim()]] : [])),
      ),
    })
    return result.areas
  } catch (err) {
    console.warn("[plan] corpus retrieval failed, continuing without it:", err instanceof Error ? err.message : err)
    return []
  }
}

function citationReasoning(briefs: DesignBrief[], findingId: string): string {
  for (const brief of briefs) {
    const citation = brief.citations.find((c) => c.id === findingId)
    const text = citation?.relevance?.trim() || citation?.appliedTo?.trim()
    if (text) return text
    const field = [brief.colors, brief.typography, brief.layout].find((f) => f.citation === findingId)
    if (field) return field.rationale
  }
  return ""
}

// One row per decision area a cited finding was retrieved for; findings the briefs never cite are dropped.
export function planCitations(
  briefs: DesignBrief[],
  legacy: PlannerRetrievalResult[],
  corpus: RetrievalResult["areas"],
): CitationToSave[] {
  const cited = new Set(briefs.flatMap(briefCitedFindingIds))
  const retrieved = [
    ...corpus.flatMap((a) =>
      a.findings.map((f, rank) => ({
        findingId: f.findingId,
        decisionArea: a.area,
        rank,
        rrfScore: f.rrfScore,
        rerankScore: f.rerankScore,
        viaRelation: f.viaRelation,
      })),
    ),
    ...legacy.flatMap((r) => {
      const area = LEGACY_DECISION_AREAS[r.decision]
      return area
        ? r.findings.map((f, rank) => ({
            findingId: f.id,
            decisionArea: area,
            rank,
            rrfScore: f.rrfScore ?? 0,
            rerankScore: f.rerankScore ?? null,
            viaRelation: f.viaRelation ?? false,
          }))
        : []
    }),
  ]
  const seen = new Set<string>()
  return retrieved.flatMap((c) => {
    const key = `${c.findingId}:${c.decisionArea}`
    if (!cited.has(c.findingId) || seen.has(key)) return []
    seen.add(key)
    return [{ ...c, reasoning: citationReasoning(briefs, c.findingId) }]
  })
}

export function reportFromBrief(brief: DesignBrief): ReportCreate {
  return {
    inputType: "FROM_SCRATCH",
    summary: `${brief.product}: ${brief.goal}`,
    primaryColor: brief.colors.primary,
    secondaryColor: brief.colors.secondary,
    accentColor: brief.colors.accent,
    colorPalette: { primary: brief.colors.primary, secondary: brief.colors.secondary, accent: brief.colors.accent },
    colorRationale: brief.colors.rationale,
    fontPrimary: brief.typography.primary,
    fontSecondary: brief.typography.secondary,
    typographyRationale: brief.typography.rationale,
    layoutStyle: brief.layout.sections.join(", "),
    layoutRationale: brief.layout.rationale,
    imageStyle: "",
    imageDirection: {},
    imageRationale: "",
    animationStyle: brief.motion,
    toneOfVoice: brief.brand.tone,
    citations: [],
    styleTagKeys: [],
  }
}

export function reportFromAgent(report: ResearchReportData): ReportCreate {
  return {
    inputType: "FROM_SCRATCH",
    ...report,
    colorPalette: report.colorPalette as Prisma.InputJsonValue,
    imageDirection: report.imageDirection as Prisma.InputJsonValue,
    seoKeywords: report.seoKeywords as Prisma.InputJsonValue | undefined,
    competitorInsights: report.competitorInsights as Prisma.InputJsonValue | undefined,
    citations: report.citations as Prisma.InputJsonValue,
  }
}

// Replaces the report's citations, so a re-run plan never leaves stale rows behind.
export async function savePlanCitations(
  projectId: string,
  citations: CitationToSave[],
  report: ReportCreate,
): Promise<CitationToSave[]> {
  const ids = [...new Set(citations.map((c) => c.findingId))]
  const known = new Set(
    ids.length
      ? (await prisma.researchFinding.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((f) => f.id)
      : [],
  )
  const rows = citations.filter((c) => known.has(c.findingId))
  const existing = await prisma.researchReport.findUnique({ where: { projectId }, select: { id: true } })
  if (!existing && !rows.length) return rows
  const reportId =
    existing?.id ??
    (await prisma.researchReport.upsert({
      where: { projectId },
      create: { ...report, projectId },
      update: {},
      select: { id: true },
    })).id
  await saveCitations(reportId, rows)
  return rows
}
