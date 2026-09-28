import { z } from "zod";
import { prisma, type Prisma } from "@useframe/db";
import { SiteSpecSchema } from "@repo/schemas";
import { runIteration, runFileIteration } from "../agents/iterate.agent.js";
export const AutoIterateSchema = z.object({
  triggeredBy: z.literal("auto_validation"),
  runId: z.string().cuid(),
  baseVersionId: z.string().cuid(),
  iteration: z.number().int().min(1).max(2),
  instruction: z.string().min(1).max(25000),
});
export async function iterateValidationVersion(
  input: z.infer<typeof AutoIterateSchema>,
): Promise<{ id: string }> {
  const run = await prisma.validationRun.findUniqueOrThrow({
    where: { id: input.runId },
  });
  if (run.status !== "RUNNING" || input.iteration >= run.maxIterations)
    throw new Error("Validation correction is not permitted");
  const key = `${run.id}-${input.iteration}`;
  const existing = await prisma.projectVersion.findUnique({
    where: { validationFixKey: key },
  });
  if (existing) return existing;
  const assessed = await prisma.validationIteration.findUniqueOrThrow({
    where: {
      validationRunId_iterationNumber: {
        validationRunId: run.id,
        iterationNumber: input.iteration,
      },
    },
  });
  if (
    assessed.passed ||
    (assessed.resultingVersionId ?? run.startVersionId) !== input.baseVersionId
  )
    throw new Error("Correction does not match the assessed version");
  const base = await prisma.projectVersion.findFirstOrThrow({
    where: { id: input.baseVersionId, projectId: run.projectId },
  });
  const nextFiles =
    run.pipeline === "REPLICATE"
      ? await runFileIteration(
          z
            .array(z.object({ path: z.string(), content: z.string() }))
            .parse(base.nextFiles),
          input.instruction,
        )
      : null;
  const snapshot =
    run.pipeline === "MAIN"
      ? (
          await runIteration(
            {
              projectId: run.projectId,
              versionId: base.id,
              currentSpec: SiteSpecSchema.parse({
                ...(base.snapshot as object),
                siteType: base.siteType,
              }),
              instruction: input.instruction,
            },
            true,
          )
        ).updatedSpec
      : base.snapshot;
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM projects WHERE id = ${run.projectId} FOR UPDATE`;
      const duplicate = await tx.projectVersion.findUnique({
        where: { validationFixKey: key },
      });
      if (duplicate) return duplicate;
      const latest = await tx.projectVersion.findFirstOrThrow({
        where: { projectId: run.projectId },
        orderBy: { versionNumber: "desc" },
      });
      return tx.projectVersion.create({
        data: {
          projectId: run.projectId,
          versionNumber: latest.versionNumber + 1,
          parentVersionId: base.id,
          label: "Auto-corrected",
          triggeredBy: "auto_validation",
          validationFixKey: key,
          siteType: base.siteType,
          snapshot: snapshot as Prisma.InputJsonValue,
          seo: base.seo as Prisma.InputJsonValue,
          ...(base.designBrief
            ? { designBrief: base.designBrief as Prisma.InputJsonValue }
            : {}),
          ...(nextFiles ? { nextFiles } : {}),
        },
      });
    },
    { timeout: 30000 },
  );
}
