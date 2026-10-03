import { z } from "zod";
import { DiscrepancySchema } from "./compareSchema.js";
import type { LoopPorts } from "./runValidationLoop.js";

export const MAIN_VALIDATION_LIMITS = {
  threshold: 95,
  maxIterations: 3,
} as const;
export const ValidationResultSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    issues: z.array(DiscrepancySchema).max(100),
    summary: z.string().max(4000),
  })
  .strict();
export class UnsupportedValidationCorrection extends Error {}

export async function validateMainAssessment(
  generate: () => Promise<unknown>,
  isMalformed: (error: unknown) => boolean = (error) =>
    error instanceof z.ZodError,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      return ValidationResultSchema.parse(await generate());
    } catch (error) {
      if (attempt === 1 || !isMalformed(error)) throw error;
    }
  }
}

export async function runMainValidationLoop(
  ports: Omit<LoopPorts, "isFreeTier">,
): Promise<void> {
  let versionId = ports.startVersionId;
  try {
    for (
      let iteration = 1;
      iteration <= MAIN_VALIDATION_LIMITS.maxIterations;
      iteration++
    ) {
      const result = await ports.assess(versionId, iteration);
      const passed = result.score >= MAIN_VALIDATION_LIMITS.threshold;
      await ports.record(versionId, iteration, result, passed);
      if (passed || iteration === MAIN_VALIDATION_LIMITS.maxIterations) {
        await ports.finish(passed ? "PASSED" : "FAILED_MAX_ITERATIONS");
        return;
      }
      versionId = await ports.iterate(versionId, iteration, result);
    }
  } catch (error) {
    await ports.finish(
      error instanceof UnsupportedValidationCorrection
        ? "FAILED_MAX_ITERATIONS"
        : "ERROR",
      error instanceof Error ? error.message : "Validation failed",
    );
  } finally {
    await ports.cleanup();
  }
}
