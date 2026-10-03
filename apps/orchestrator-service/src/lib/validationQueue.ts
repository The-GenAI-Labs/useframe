import { deleteGcsPrefix, validationPrefix } from "@repo/validation/storage";
import { Queue } from "bullmq";
import { QUEUES } from "@repo/events";
import {
  ensureValidationRun,
  ensureReplicationProject,
  prisma,
} from "@useframe/db";
import { redis } from "./redis.js";
import { env } from "../config/env.js";
const queue = new Queue(QUEUES.VALIDATE, { connection: redis });
const mainQueue = new Queue(QUEUES.VALIDATE_MAIN, { connection: redis });

export async function enqueueValidation(
  projectId: string,
  versionId: string,
  pipeline: "MAIN" | "REPLICATE",
) {
  if (!env.GCS_BUCKET) return;
  const run = await ensureValidationRun(projectId, versionId, pipeline);
  if (run?.status === "QUEUED")
    await (pipeline === "MAIN" ? mainQueue : queue).add(
      "validate",
      { runId: run.id },
      { jobId: run.id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    );
}
export async function completeReplicationValidation(
  replicationId: string,
  files: { path: string; content: string }[],
) {
  const { project, version } = await ensureReplicationProject(replicationId);
  await prisma.projectVersion.update({
    where: { id: version.id },
    data: { nextFiles: files },
  });
  await prisma.project.update({
    where: { id: project.id },
    data: { status: "READY", currentVersionId: version.id },
  });
  await enqueueValidation(project.id, version.id, "REPLICATE");
}
export async function abandonReplicationValidation(replicationId: string) {
  if (!env.GCS_BUCKET) return;
  const run = await prisma.validationRun.findFirst({
    where: {
      project: { replication: { id: replicationId } },
      status: "QUEUED",
    },
  });
  if (!run) return;
  await prisma.validationRun.update({
    where: { id: run.id },
    data: {
      status: "ERROR",
      errorMessage: "Generation did not complete",
      finishedAt: new Date(),
    },
  });
  await deleteGcsPrefix(validationPrefix(run.pipeline, run.projectId, run.id));
}
