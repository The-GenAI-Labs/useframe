import { prisma } from "@useframe/db";
import { getProjectResearch } from "@repo/rag";
import type { ProjectChatTopic, ProjectResearchView } from "@repo/schemas";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function boundedContext(
  value: unknown,
  depth = 0,
  budget = { remaining: 12000 },
): unknown {
  if (depth > 6 || budget.remaining <= 0) return null;
  if (typeof value === "string") {
    const text = value.slice(0, Math.min(3000, budget.remaining));
    budget.remaining -= text.length;
    return text;
  }
  if (Array.isArray(value))
    return value
      .slice(0, 20)
      .map((item) => boundedContext(item, depth + 1, budget));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 30)
        .map(([key, item]) => [key, boundedContext(item, depth + 1, budget)]),
    );
  return value;
}
export async function loadChatGrounding(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      startupIdea: true,
      niche: true,
      targetAudience: true,
      description: true,
      brandPersonality: true,
      differentiator: true,
      currentVersionId: true,
      researchIntake: { select: { rawIdea: true, answers: true } },
      researchReport: {
        select: { summary: true, seoKeywords: true, competitorInsights: true },
      },
    },
  });
  if (!project) throw new Error("Project not found");
  const [research, version, scans] = await Promise.all([
    getProjectResearch(projectId),
    project.currentVersionId
      ? prisma.projectVersion.findFirst({
          where: { id: project.currentVersionId, projectId },
          select: {
            seo: true,
            designBrief: true,
            snapshot: true,
            pages: {
              where: { deletedAt: null },
              take: 20,
              select: { slug: true, title: true, seo: true },
            },
          },
        })
      : null,
    prisma.competitorScan.findMany({
      where: { projectId, userId, status: "DONE" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        sourceUrl: true,
        extractedContent: true,
        designTokens: true,
        videoAnalysis: true,
      },
    }),
  ]);
  const snapshotPages = record(version?.snapshot).pages;
  return {
    areas: research?.areas ?? [],
    overview: boundedContext({
      name: project.name,
      idea: project.startupIdea,
      niche: project.niche,
      audience: project.targetAudience,
      description: project.description,
      personality: project.brandPersonality,
      differentiator: project.differentiator,
      intake: project.researchIntake,
      summary: project.researchReport?.summary,
      designBrief: version?.designBrief,
    }),
    seo: boundedContext({
      files: version?.seo,
      pages: Array.isArray(snapshotPages)
        ? snapshotPages
            .slice(0, 20)
            .map((page) => ({ slug: record(page).slug, seo: record(page).seo }))
        : [],
      storedPages: version?.pages,
      keywords: project.researchReport?.seoKeywords,
    }),
    competitor: boundedContext({
      insights: project.researchReport?.competitorInsights,
      scans,
    }),
  };
}
export type ChatGrounding = {
  areas: ProjectResearchView["areas"];
  overview: unknown;
  seo: unknown;
  competitor: unknown;
};
export function assembleChatContext(
  grounding: ChatGrounding,
  topic: ProjectChatTopic | null,
) {
  const areas = grounding.areas
    .filter((area) => topic === null || area.area === topic)
    .map((area) => ({
      ...area,
      findings: area.findings.slice(0, 12).map((finding) => ({
        ...finding,
        statement: finding.statement.slice(0, 4000),
        reasoning: finding.reasoning.slice(0, 2000),
      })),
    }));
  return {
    areas,
    overview:
      topic === null || topic === "PROJECT_OVERVIEW"
        ? grounding.overview
        : undefined,
    seo: topic === null || topic === "SEO" ? grounding.seo : undefined,
    competitor:
      topic === null || topic === "COMPETITOR"
        ? grounding.competitor
        : undefined,
  };
}
export function validateChatCitations(
  ids: string[],
  context: ReturnType<typeof assembleChatContext>,
) {
  const allowed = new Set(
    context.areas.flatMap((area) =>
      area.findings.map((finding) => finding.findingId),
    ),
  );
  return [...new Set(ids)].filter((id) => allowed.has(id));
}
