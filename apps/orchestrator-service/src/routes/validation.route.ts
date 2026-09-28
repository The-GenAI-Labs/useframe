import { Router } from "express";
import { z } from "zod";
import sharp from "sharp";
import { prisma } from "@useframe/db";
import { CaptureSchema } from "@repo/validation";
import { downloadScreenshot, validationPrefix } from "@repo/validation/storage";
import { isValidationWorker } from "../lib/internalValidationAuth.js";
import { compareMain } from "../validation/mainComparison.js";
import { compareReplicate } from "../validation/replicateComparison.js";
const router: Router = Router();
router.post("/validation/compare", async (req, res, next) => {
  if (!isValidationWorker(req)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const input = z
    .object({
      runId: z.string().cuid(),
      iteration: z.number().int().min(1).max(3),
    })
    .safeParse(req.body);
  if (!input.success) {
    res.status(422).json({ message: "Invalid validation request" });
    return;
  }
  try {
    const run = await prisma.validationRun.findUniqueOrThrow({
      where: { id: input.data.runId },
      include: { startVersion: true },
    });
    if (run.status !== "RUNNING")
      throw new Error("Validation run is not active");
    const prefix = validationPrefix(run.pipeline, run.projectId, run.id);
    const all = z.array(CaptureSchema).parse(run.renderedScreenshotKeys);
    const rendered = all.filter((s) =>
      s.key.startsWith(`${prefix}rendered/${input.data.iteration}/`),
    );
    const selected =
      run.tier === 1 ? rendered.filter((s) => s.section === "hero") : rendered;
    if (!selected.length)
      throw new Error("No screenshots available for comparison");
    const originals =
      run.pipeline === "REPLICATE"
        ? z.array(CaptureSchema).parse(run.originalScreenshotKeys)
        : [];
    const image = async (key: string) =>
      sharp(await downloadScreenshot(key, prefix))
        .resize({
          width: 1568,
          height: 1568,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
    const results = [];
    for (let start = 0; start < selected.length; start += 4) {
      const batch = selected.slice(start, start + 4);
      if (run.pipeline === "REPLICATE") {
        const pairs = [];
        for (const capture of batch) {
          const original = originals.find((s) => s.section === capture.section);
          if (!original)
            throw new Error(`Original screenshot missing: ${capture.section}`);
          pairs.push({
            section: capture.section,
            original: await image(original.key),
            rendered: await image(capture.key),
          });
        }
        results.push(await compareReplicate(pairs));
      } else {
        results.push(
          await compareMain(
            run.startVersion.designBrief,
            await Promise.all(
              batch.map(async (s) => ({
                section: s.section,
                image: await image(s.key),
              })),
            ),
          ),
        );
      }
    }
    // A poor section cannot be hidden by averaging many near-identical scroll frames.
    res.json({
      score: Math.min(...results.map((r) => r.score)),
      discrepancies: results.flatMap((r) => r.discrepancies).slice(0, 100),
      summary: results
        .map((r) => r.summary)
        .join("\n")
        .slice(0, 4000),
    });
  } catch (error) {
    next(error);
  }
});
export default router;
