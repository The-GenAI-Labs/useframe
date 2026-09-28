import { Queue, Worker } from "bullmq";
import { chromium } from "playwright";
import { z } from "zod";
import { prisma, ensureValidationRun } from "@useframe/db";
import { QUEUES, type ValidationJobPayload } from "@repo/events";
import { SiteSpecSchema } from "@repo/schemas";
import { buildSiteFiles, withScaffold, toRoutePath } from "@repo/site-builder";
import {
  CaptureSchema,
  ComparisonResultSchema,
  FULL_PAGE_THRESHOLD,
  decideValidationTier,
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
    await queue.add(
      "validate",
      { runId: run.id },
      { jobId: run.id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 },
    );
}
async function orchestrator(path: string, body: object) {
  const response = await fetch(`${env.ORCHESTRATOR_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": env.INTERNAL_SERVICE_SECRET,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(path === "/iterate" ? 240000 : 1800000),
  });
  if (!response.ok)
    throw new Error(`Validation ${path} failed (HTTP ${response.status})`);
  return response.json() as Promise<unknown>;
}
export async function processValidation(runId: string) {
  const run = await prisma.validationRun.findUniqueOrThrow({
    where: { id: runId },
  });
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
    const files =
      run.pipeline === "REPLICATE"
        ? withScaffold(
            z
              .array(z.object({ path: z.string(), content: z.string() }))
              .parse(version.nextFiles),
          )
        : buildSiteFiles(
            SiteSpecSchema.parse({
              ...(version.snapshot as object),
              siteType: version.siteType,
            }),
          );
    const preview = await startLocalPreview(
      files,
      run.projectId,
      run.pipeline === "REPLICATE" ? "next" : "vite",
    );
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
    const original =
      run.pipeline === "REPLICATE"
        ? z.array(CaptureSchema).min(1).parse(run.originalScreenshotKeys)
        : [];
    first = await prepare(run.startVersionId);
    const height = await first.page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    let tier = run.tier;
    if (run.pipeline === "MAIN") {
      if (!first.version.designBrief)
        throw new Error("Approved DesignBrief is unavailable");
      tier = decideValidationTier({
        pageHeightPx: height,
        fullPageThresholdPx: FULL_PAGE_THRESHOLD,
        usesAnimationLibrary: false,
        usesVirtualization: false,
        hasPinnedElements: false,
        capturedFrameCount: Math.max(
          Math.ceil(height / 800),
          SiteSpecSchema.parse({
            ...(first.version.snapshot as object),
            siteType: first.version.siteType,
          }).pages.length,
        ),
        aiSelfReportedConfidence: "uncertain",
      });
      await prisma.validationRun.update({
        where: { id: run.id },
        data: { tier },
      });
    }
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
          const routes =
            run.pipeline === "MAIN"
              ? [
                  ...new Set([
                    "/",
                    ...SiteSpecSchema.parse({
                      ...(context.version.snapshot as object),
                      siteType: context.version.siteType,
                    }).pages.map((p) => toRoutePath(p.slug)),
                  ]),
                ]
              : ["/"];
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
              run.pipeline === "REPLICATE"
                ? tier === 1
                  ? original.filter((s) => s.section === "hero")
                  : original
                : Array.from(
                    {
                      length:
                        tier === 1
                          ? 1
                          : Math.max(1, Math.ceil(pageHeight / 800)),
                    },
                    (_, i) => ({
                      section:
                        routeIndex === 0 && i === 0
                          ? "hero"
                          : `page-${routeIndex}-section-${i}`,
                      scrollY: i * 800,
                      fullPage: false,
                      wheel: false,
                    }),
                  );
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
          project: { status: "READY", replication: null, deletedAt: null },
        },
        select: { id: true, projectId: true },
        take: 100,
      });
      for (const version of unqueued)
        await ensureValidationRun(version.projectId, version.id, "MAIN");
      // Recover the database/queue gap without re-running completed assessments.
      const queued = await prisma.validationRun.findMany({
        where: { status: "QUEUED", project: { status: "READY" } },
        take: 100,
        orderBy: { startedAt: "asc" },
      });
      for (const run of queued)
        await queue.add(
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
  for (const w of [worker, cleanup])
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
      await Promise.all([worker.close(), cleanup.close()]);
      await Promise.all([queue.close(), cleanupQueue.close()]);
    },
  };
}
