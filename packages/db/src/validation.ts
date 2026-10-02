import { prisma } from "./index.js";

export async function ensureValidationRun(
  projectId: string,
  startVersionId: string,
  pipeline: "MAIN" | "REPLICATE",
) {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });
  if (
    pipeline === "MAIN" &&
    (project.generationTier !== "PAID" || project.deletedAt)
  )
    return null;
  const version = await prisma.projectVersion.findFirstOrThrow({
    where: { id: startVersionId, projectId },
  });
  if (version.triggeredBy === "auto_validation") return null;
  const isFreeTier = project.generationTier === "FREE";
  return prisma.validationRun.upsert({
    where: { startVersionId_pipeline: { startVersionId, pipeline } },
    create: {
      projectId,
      startVersionId,
      pipeline,
      tier: 0,
      isFreeTier,
      threshold: isFreeTier ? 90 : 95,
      maxIterations: isFreeTier ? 2 : 3,
    },
    update: {},
  });
}

export async function ensureReplicationProject(replicationId: string) {
  return prisma.$transaction(
    async (tx) => {
      const replication = await tx.replication.findUniqueOrThrow({
        where: { id: replicationId },
      });
      const project = await tx.project.upsert({
        where: { id: replication.projectId ?? replication.id },
        create: {
          id: replication.id,
          userId: replication.userId,
          slug: `replica-${replication.slug}`,
          name: replication.sourceUrl,
          startupIdea: "Website replication",
          targetAudience: "",
          sourceUrl: replication.sourceUrl,
          generationTier: replication.tier,
          status: "GENERATING",
          versions: {
            create: { versionNumber: 1, siteType: "SINGLE_PAGE", snapshot: {} },
          },
        },
        update: {},
        include: { versions: { orderBy: { versionNumber: "asc" }, take: 1 } },
      });
      await tx.replication.update({
        where: { id: replicationId },
        data: { projectId: project.id },
      });
      return { project, version: project.versions[0]! };
    },
    { timeout: 30000 },
  );
}
