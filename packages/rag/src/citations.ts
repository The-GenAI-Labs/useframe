import { prisma, type Prisma } from "@useframe/db";
import { CitationToSaveSchema } from "@repo/schemas";
import {
  DECISION_AREAS,
  type CitationToSave,
  type ProjectResearchView,
} from "./contract.js";

export async function saveCitations(
  researchReportId: string,
  citations: CitationToSave[],
): Promise<void> {
  const parsed = CitationToSaveSchema.array().parse(citations);
  const unique = [
    ...new Map(
      parsed.map((c) => [`${c.findingId}:${c.decisionArea}`, c]),
    ).values(),
  ];
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM research_reports WHERE id = ${researchReportId} FOR UPDATE`;
      const previous = await tx.researchReportCitation.findMany({
        where: { researchReportId },
        select: { findingId: true },
      });
      const touched = [
        ...new Set([
          ...previous.map((c) => c.findingId),
          ...unique.map((c) => c.findingId),
        ]),
      ].sort();
      // Lock shared findings before replacing citations so concurrent reports cannot lose reuse counts.
      if (touched.length)
        await tx.$queryRaw`SELECT id FROM research_findings WHERE id = ANY(${touched}::text[]) ORDER BY id FOR UPDATE`;
      await tx.researchReport.update({
        where: { id: researchReportId },
        data: { citations: unique as unknown as Prisma.InputJsonValue },
      });
      await tx.researchReportCitation.deleteMany({
        where: { researchReportId },
      });
      if (unique.length)
        await tx.researchReportCitation.createMany({
          data: unique.map((c) => ({ ...c, researchReportId })),
        });
      if (touched.length)
        await tx.$executeRaw`UPDATE research_findings f SET "reuseCount" = (SELECT COUNT(DISTINCT "researchReportId")::int FROM research_report_citations c WHERE c."findingId" = f.id) WHERE f.id = ANY(${touched}::text[])`;
    },
    { timeout: 30000 },
  );
}
export async function getProjectResearch(
  projectId: string,
): Promise<ProjectResearchView | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      citations: Array<{
        findingId: string;
        slug: string;
        title: string;
        statement: string;
        appliesWhen: string | null;
        reasoning: string;
        rank: number;
        viaRelation: boolean;
        retired: boolean;
        decisionArea: string;
        source: ProjectResearchView["areas"][number]["findings"][number]["source"];
      }>;
    }>
  >`
    SELECT r.id, COALESCE(jsonb_agg(jsonb_build_object('findingId', f.id, 'slug', f.slug, 'title', f.title, 'statement', f.statement,
      'appliesWhen', f."appliesWhen", 'reasoning', c.reasoning, 'rank', c.rank, 'viaRelation', c."viaRelation", 'decisionArea', c."decisionArea", 'retired', f.status = 'RETIRED',
      'source', CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('title', s.title, 'authors', s.authors, 'year', s.year, 'venue', s.venue, 'url', s.url, 'doi', s.doi, 'locator', f."sourceLocator") END)
      ORDER BY c.rank, f.slug) FILTER (WHERE c.id IS NOT NULL), '[]'::jsonb) AS citations
    FROM research_reports r LEFT JOIN research_report_citations c ON c."researchReportId" = r.id LEFT JOIN research_findings f ON f.id = c."findingId"
    LEFT JOIN source_documents s ON s.id = f."sourceDocumentId" WHERE r."projectId" = ${projectId} GROUP BY r.id`;
  const report = rows[0];
  if (!report) return null;
  return {
    researchReportId: report.id,
    areas: DECISION_AREAS.flatMap((area) => {
      const findings = report.citations
        .filter((c) => c.decisionArea === area)
        .map(({ decisionArea: _, ...view }) => view);
      return findings.length ? [{ area, findings }] : [];
    }),
  };
}
