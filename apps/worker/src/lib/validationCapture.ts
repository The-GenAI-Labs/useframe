import {
  ensureReplicationProject,
  ensureValidationRun,
  prisma,
} from "@useframe/db";
import {
  FULL_PAGE_THRESHOLD,
  decideValidationTier,
  type TierSignals,
} from "@repo/validation";
import {
  uploadToGcs,
  validationPrefix,
  deleteGcsPrefix,
  SCREENSHOT_TTL_MS,
} from "@repo/validation/storage";
import { env } from "../config/env.js";

export async function saveReplicationGroundTruth(
  replicationId: string,
  frames: {
    section: string;
    scrollY: number;
    image: Buffer;
    fullPage?: boolean;
    wheel?: boolean;
  }[],
  signals: Omit<
    TierSignals,
    "fullPageThresholdPx" | "capturedFrameCount" | "aiSelfReportedConfidence"
  >,
) {
  if (!env.GCS_BUCKET) return;
  const { project, version } = await ensureReplicationProject(replicationId);
  const run = await ensureValidationRun(project.id, version.id, "REPLICATE");
  if (!run || run.originalScreenshotKeys || run.status !== "QUEUED") return;
  const prefix = validationPrefix("REPLICATE", project.id, run.id);
  try {
    const keys = [];
    for (const frame of frames) {
      const key = await uploadToGcs(
        `${prefix}original/${frame.section}.png`,
        frame.image,
        new Date(run.startedAt.getTime() + SCREENSHOT_TTL_MS),
      );
      keys.push({
        section: frame.section,
        scrollY: frame.scrollY,
        fullPage: frame.fullPage ?? false,
        wheel: frame.wheel ?? false,
        key,
      });
    }
    const tierSignals = {
      ...signals,
      fullPageThresholdPx: FULL_PAGE_THRESHOLD,
      capturedFrameCount: frames.length,
      aiSelfReportedConfidence: "uncertain" as const,
    };
    await prisma.validationRun.update({
      where: { id: run.id },
      data: {
        originalScreenshotKeys: keys,
        signals: tierSignals,
        tier: decideValidationTier(tierSignals),
      },
    });
  } catch (error) {
    await prisma.validationRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: "Original screenshot capture storage failed",
      },
    });
    await deleteGcsPrefix(prefix).catch((cleanupError) =>
      console.error("[validation] cleanup failed", cleanupError),
    );
    throw error;
  }
}
export async function abandonReplicationCapture(replicationId: string) {
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
      errorMessage: "Source investigation did not complete",
      finishedAt: new Date(),
    },
  });
  await deleteGcsPrefix(validationPrefix(run.pipeline, run.projectId, run.id));
}
