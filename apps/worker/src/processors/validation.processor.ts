import { processMainValidation } from "./mainValidation.processor.js";
import { validationRequest as orchestrator } from "../lib/validationRequest.js";
import { Queue, Worker } from "bullmq";
import { chromium } from "playwright";
import { z } from "zod";
import { prisma, ensureValidationRun } from "@useframe/db";
import { QUEUES, type ValidationJobPayload } from "@repo/events";
import { withScaffold } from "@repo/site-builder";
import {
  CaptureSchema,
  ComparisonResultSchema,
  formatDiscrepanciesAsIterateInstruction,
  runTier0Checks,
  runValidationLoop,
} from "@repo/validation";
import {
  startLocalPreview,
  deleteExpiredPreviewPods,
} from "@repo/validation/localPreview";
import {
  uploadToGcs,
  validationPrefix,
  deleteGcsPrefix,
  deleteExpiredScreenshots,
  SCREENSHOT_TTL_MS,
} from "@repo/validation/storage";
import { env } from "../config/env.js";
import { redis } from "../lib/redis.js";

const queue = new Queue(QUEUES.VALIDATE, { connection: redis });
const mainQueue = new Queue(QUEUES.VALIDATE_MAIN, { connection: redis });
const cleanupQueue = new Queue(QUEUES.VALIDATION_CLEANUP, {
  connection: redis,
});
export async function enqueueDeployedValidation(
  projectId: string,
  versionId: string,
) {
  if (!env.GCS_BUCKET) return;
  const run = await ensureValidationRun(projectId, versionId, "MAIN");
  if (run?.status === "QUEUED")
    await mainQueue.add(
      "validate",
      { runId: run.id },
      { jobId: run.id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    );
}
export async function processValidation(runId: string) {
  const run = await prisma.validationRun.findUniqueOrThrow({
    where: { id: runId },
  });
  if (run.pipeline === "MAIN") return processMainValidation(runId);
  const prefix = validationPrefix(run.pipeline, run.projectId, run.id);
  if (!["QUEUED", "RUNNING"].includes(run.status)) {
    await deleteGcsPrefix(prefix);
    return;
  }
  // A stalled RUNNING job is abandoned rather than spending an unbounded second AI budget.
  if (run.status === "RUNNING") {
    await prisma.validationRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        finishedAt: new Date(),
        errorMessage: "Worker interrupted during validation",
      },
    });
    await deleteGcsPrefix(prefix);
    return;
  }
  const claimed = await prisma.validationRun.updateMany({
    where: { id: run.id, status: "QUEUED" },
    data: { status: "RUNNING" },
  });
  if (!claimed.count) return;
  const expiresAt = new Date(run.startedAt.getTime() + SCREENSHOT_TTL_MS);
  let first: Awaited<ReturnType<typeof prepare>> | undefined;
  async function prepare(versionId: string) {
    const version = await prisma.projectVersion.findFirstOrThrow({
      where: { id: versionId, projectId: run.projectId },
    });
    const files = withScaffold(
      z
        .array(z.object({ path: z.string(), content: z.string() }))
        .parse(version.nextFiles),
    );
    const preview = await startLocalPreview(files, run.projectId, "next");
    try {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 800 },
          serviceWorkers: "block",
        });
        const checks = await runTier0Checks(preview.url, page);
        return { preview, browser, page, checks, version };
      } catch (error) {
        await browser.close();
        throw error;
      }
    } catch (error) {
      await preview.kill();
      throw error;
    }
  }
  try {
    if (Date.now() >= expiresAt.getTime())
      throw new Error("Original capture expired before validation started");
    const original = z
      .array(CaptureSchema)
      .min(1)
      .parse(run.originalScreenshotKeys);
    first = await prepare(run.startVersionId);
    const tier = run.tier;
    if (tier !== 1 && tier !== 2) throw new Error("Missing capture tier");
    const renderedKeys: z.infer<typeof CaptureSchema>[] = [];
    await runValidationLoop({
      startVersionId: run.startVersionId,
      isFreeTier: run.isFreeTier,
      assess: async (versionId, iteration) => {
        if (Date.now() >= expiresAt.getTime())
          throw new Error("Validation capture lifetime exceeded");
        const context = first ?? (await prepare(versionId));
        first = undefined;
        const { preview, browser, page, checks } = context;
        try {
          const routes = ["/"];
          for (const [routeIndex, route] of routes.entries()) {
            if (routeIndex > 0) {
              const routeChecks = await runTier0Checks(
                new URL(route, preview.url).href,
                page,
              );
              checks.issues.push(
                ...routeChecks.issues.map((issue) => ({
                  ...issue,
                  detail: `${route}: ${issue.detail}`,
                })),
              );
              checks.passed = checks.passed && routeChecks.passed;
            }
            const pageHeight = await page.evaluate(
              () => document.documentElement.scrollHeight,
            );
            if (pageHeight > 30000)
              throw new Error("Rendered page exceeds safe capture limit");
            const positions =
              tier === 1
                ? original.filter((s) => s.section === "hero")
                : original;
            for (const capture of positions) {
              if (capture.wheel) {
                await page.evaluate(() => window.scrollTo(0, 0));
                for (let y = 0; y < capture.scrollY; y += 120) {
                  await page.mouse.wheel(0, Math.min(120, capture.scrollY - y));
                  await page.waitForTimeout(120);
                }
              } else {
                await page.evaluate(
                  (y) => window.scrollTo(0, y),
                  capture.scrollY,
                );
                await page.waitForTimeout(200);
              }
              const image = await page.screenshot({
                fullPage: capture.fullPage,
                timeout: 15000,
              });
              const key = await uploadToGcs(
                `${prefix}rendered/${iteration}/${capture.section}.png`,
                image,
                expiresAt,
              );
              renderedKeys.push({
                section: capture.section,
                scrollY: capture.scrollY,
                fullPage: capture.fullPage,
                wheel: capture.wheel,
                key,
              });
            }
          }
          await prisma.validationRun.update({
            where: { id: run.id },
            data: { renderedScreenshotKeys: renderedKeys },
          });
          const vision = checks.passed
            ? ComparisonResultSchema.parse(
                await orchestrator("/validation/compare", {
                  runId: run.id,
                  iteration,
                }),
              )
            : {
                score: 60,
                discrepancies: [],
                summary: "Deterministic render checks failed",
              };
          return {
            ...vision,
            score: checks.passed ? vision.score : Math.min(60, vision.score),
            discrepancies: [
              ...checks.issues.map((i) => ({
                section: "build",
                issue: i.detail,
                severity: "major" as const,
              })),
              ...vision.discrepancies,
            ],
          };
        } finally {
          try {
            await browser.close();
          } finally {
            await preview.kill();
          }
        }
      },
      record: async (versionId, iteration, result, passed) => {
        await prisma.$transaction([
          prisma.validationIteration.create({
            data: {
              validationRunId: run.id,
              iterationNumber: iteration,
              resultingVersionId: iteration === 1 ? null : versionId,
              score: result.score,
              discrepancies: result.discrepancies,
              passed,
            },
          }),
          prisma.validationRun.update({
            where: { id: run.id },
            data: {
              iterationCount: iteration,
              finalScore: result.score,
              discrepancies: result.discrepancies,
            },
          }),
        ]);
      },
      iterate: async (versionId, iteration, result) => {
        const response = await orchestrator("/iterate", {
          triggeredBy: "auto_validation",
          runId: run.id,
          baseVersionId: versionId,
          iteration,
          instruction: formatDiscrepanciesAsIterateInstruction(
            result.discrepancies,
          ),
        });
        return z.object({ id: z.string().cuid() }).parse(response).id;
      },
      finish: async (status, errorMessage) => {
        if (errorMessage)
          console.error(`[validation] ${run.id}: ${errorMessage}`);
        await prisma.validationRun.update({
          where: { id: run.id },
          data: { status, errorMessage, finishedAt: new Date() },
        });
      },
      cleanup: () => deleteGcsPrefix(prefix),
    });
  } catch (error) {
    console.error(`[validation] ${run.id} failed`, error);
    await prisma.validationRun.update({
      where: { id: run.id },
      data: {
        status: "ERROR",
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 4000)
            : "Validation failed",
        finishedAt: new Date(),
      },
    });
  } finally {
    if (first) {
      try {
        await first.browser.close();
      } finally {
        await first.preview.kill();
      }
    }
    await deleteGcsPrefix(prefix);
  }
}

export function startValidationWorkers() {
  const mainWorker = new Worker<ValidationJobPayload>(
    QUEUES.VALIDATE_MAIN,
    (job) => processMainValidation(job.data.runId),
    { connection: redis, concurrency: 1, lockDuration: 120000 },
  );
  const worker = new Worker<ValidationJobPayload>(
    QUEUES.VALIDATE,
    (job) => processValidation(job.data.runId),
    { connection: redis, concurrency: 1, lockDuration: 120000 },
  );
  const cleanup = new Worker(
    QUEUES.VALIDATION_CLEANUP,
    async () => {
      await Promise.all([
        deleteExpiredScreenshots(),
        deleteExpiredPreviewPods(),
      ]);
      await prisma.validationRun.updateMany({
        where: {
          status: { in: ["QUEUED", "RUNNING"] },
          startedAt: { lt: new Date(Date.now() - SCREENSHOT_TTL_MS) },
        },
        data: {
          status: "ERROR",
          finishedAt: new Date(),
          errorMessage: "Validation capture lifetime expired",
        },
      });
      const unqueued = await prisma.projectVersion.findMany({
        where: {
          createdAt: { gt: new Date(Date.now() - SCREENSHOT_TTL_MS) },
          triggeredBy: null,
          validationRuns: { none: {} },
          project: {
            status: "READY",
            replication: null,
            deletedAt: null,
            generationTier: "PAID",
          },
        },
        select: { id: true, projectId: true },
        take: 100,
      });
      for (const version of unqueued)
        await ensureValidationRun(version.projectId, version.id, "MAIN");
      // Recover the database/queue gap without re-running completed assessments.
      const queued = await prisma.validationRun.findMany({
        where: {
          status: "QUEUED",
          project: { status: "READY" },
          OR: [
            { pipeline: "REPLICATE" },
            {
              pipeline: "MAIN",
              isFreeTier: false,
              project: { generationTier: "PAID", deletedAt: null },
            },
          ],
        },
        take: 100,
        orderBy: { startedAt: "asc" },
      });
      for (const run of queued)
        await (run.pipeline === "MAIN" ? mainQueue : queue).add(
          "validate",
          { runId: run.id },
          {
            jobId: run.id,
            attempts: 1,
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        );
    },
    { connection: redis, concurrency: 1 },
  );
  for (const w of [worker, mainWorker, cleanup])
    w.on("failed", (job, error) =>
      console.error(`[validation] Job ${job?.id} failed`, error),
    );
  void cleanupQueue
    .upsertJobScheduler(
      "validation-expiry",
      { every: 10 * 60 * 1000 },
      {
        name: "cleanup",
        data: {},
        opts: { removeOnComplete: 10, removeOnFail: 10 },
      },
    )
    .catch(console.error);
  return {
    close: async () => {
      await Promise.all([worker.close(), mainWorker.close(), cleanup.close()]);
      await Promise.all([
        queue.close(),
        mainQueue.close(),
        cleanupQueue.close(),
      ]);
    },
  };
}
