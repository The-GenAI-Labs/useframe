import { chromium } from "playwright";
import { z } from "zod";
import { prisma } from "@useframe/db";
import { SiteSpecSchema } from "@repo/schemas";
import { buildSiteFiles, toRoutePath } from "@repo/site-builder";
import {
  ComparisonResultSchema,
  MAIN_VALIDATION_LIMITS,
  formatDiscrepanciesAsIterateInstruction,
  runMainValidationLoop,
  runTier0Checks,
  type Capture,
} from "@repo/validation";
import { startLocalPreview } from "@repo/validation/localPreview";
import {
  uploadToGcs,
  validationPrefix,
  deleteGcsPrefix,
  SCREENSHOT_TTL_MS,
} from "@repo/validation/storage";
import { validationRequest } from "../lib/validationRequest.js";

export async function processMainValidation(runId: string) {
  const run = await prisma.validationRun.findUniqueOrThrow({
    where: { id: runId },
    include: { project: { select: { generationTier: true, deletedAt: true } } },
  });
  if (run.pipeline !== "MAIN")
    throw new Error("MAIN processor cannot validate another pipeline");
  const prefix = validationPrefix("MAIN", run.projectId, run.id);
  let cleaned = false;
  const cleanup = async () => {
    if (!cleaned) {
      await deleteGcsPrefix(prefix);
      cleaned = true;
    }
  };
  try {
    if (!["QUEUED", "RUNNING"].includes(run.status)) return;
    if (
      run.isFreeTier ||
      run.project.generationTier !== "PAID" ||
      run.project.deletedAt
    ) {
      await prisma.validationRun.update({
        where: { id: run.id },
        data: {
          status: "ERROR",
          finishedAt: new Date(),
          errorMessage: "MAIN validation requires a paid generation",
        },
      });
      return;
    }
    if (run.status === "RUNNING")
      throw new Error("Worker interrupted during validation");
    const claimed = await prisma.validationRun.updateMany({
      where: { id: run.id, status: "QUEUED" },
      data: { status: "RUNNING", ...MAIN_VALIDATION_LIMITS, tier: 2 },
    });
    if (!claimed.count) {
      cleaned = true;
      return;
    }
    const expiresAt = new Date(run.startedAt.getTime() + SCREENSHOT_TTL_MS);
    const captures: Capture[] = [];
    await runMainValidationLoop({
      startVersionId: run.startVersionId,
      assess: async (versionId, iteration) => {
        if (Date.now() >= expiresAt.getTime())
          throw new Error("Validation capture lifetime exceeded");
        const version = await prisma.projectVersion.findFirstOrThrow({
          where: { id: versionId, projectId: run.projectId },
        });
        const spec = SiteSpecSchema.parse({
          ...(version.snapshot as object),
          siteType: version.siteType,
        });
        const preview = await startLocalPreview(
          buildSiteFiles(spec),
          run.projectId,
        );
        try {
          const browser = await chromium.launch({ headless: true });
          try {
            const page = await browser.newPage({
              viewport: { width: 1280, height: 800 },
              serviceWorkers: "block",
            });
            const issues: Array<{ check: string; detail: string }> = [];
            const routes = [
              ...new Set([
                "/",
                ...spec.pages.map((page) => toRoutePath(page.slug)),
              ]),
            ];
            let imageCount = 0;
            for (const [routeIndex, route] of routes.entries()) {
              const checks = await runTier0Checks(
                new URL(route, preview.url).href,
                page,
              );
              issues.push(
                ...checks.issues.map((issue) => ({
                  ...issue,
                  detail: `${route}: ${issue.detail}`,
                })),
              );
              const height = await page.evaluate(
                () => document.documentElement.scrollHeight,
              );
              if (height > 30000)
                throw new Error("Rendered page exceeds safe capture limit");
              for (let y = 0; y < Math.max(height, 1); y += 800) {
                if (++imageCount > 80)
                  throw new Error(
                    "Generated site exceeds the single-assessment screenshot limit",
                  );
                await page.evaluate((y) => window.scrollTo(0, y), y);
                await page.waitForTimeout(200);
                const section = `page-${routeIndex}-section-${y / 800}`;
                const image = await page.screenshot({
                  fullPage: false,
                  timeout: 15000,
                });
                const key = await uploadToGcs(
                  `${prefix}rendered/${iteration}/${section}.png`,
                  image,
                  expiresAt,
                );
                captures.push({
                  section,
                  scrollY: y,
                  fullPage: false,
                  wheel: false,
                  key,
                });
              }
            }
            await prisma.validationRun.update({
              where: { id: run.id },
              data: { renderedScreenshotKeys: captures },
            });
            const vision = ComparisonResultSchema.parse(
              await validationRequest("/validation/compare", {
                runId: run.id,
                iteration,
              }),
            );
            return {
              ...vision,
              score: issues.length ? Math.min(60, vision.score) : vision.score,
              discrepancies: [
                ...issues.map((issue) => ({
                  section: "build",
                  issue: issue.detail.slice(0, 2000),
                  severity: "major" as const,
                })),
                ...vision.discrepancies,
              ].slice(0, 100),
            };
          } finally {
            await browser.close();
          }
        } finally {
          await preview.kill();
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
        const response = await validationRequest("/iterate", {
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
          console.error(`[validation-main] ${run.id}: ${errorMessage}`);
        await prisma.validationRun.update({
          where: { id: run.id },
          data: { status, errorMessage, finishedAt: new Date() },
        });
      },
      cleanup,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 4000)
        : "Validation failed";
    console.error(`[validation-main] ${run.id}: ${message}`);
    await prisma.validationRun.update({
      where: { id: run.id },
      data: { status: "ERROR", errorMessage: message, finishedAt: new Date() },
    });
  } finally {
    await cleanup();
  }
}
