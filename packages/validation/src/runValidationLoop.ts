import type { ComparisonResult } from "./compareSchema.js";

export function validationLimits(isFreeTier: boolean) {
  return { threshold: isFreeTier ? 90 : 95, maxIterations: isFreeTier ? 2 : 3 };
}

export interface LoopPorts {
  startVersionId: string;
  isFreeTier: boolean;
  assess(versionId: string, iteration: number): Promise<ComparisonResult>;
  record(
    versionId: string,
    iteration: number,
    result: ComparisonResult,
    passed: boolean,
  ): Promise<void>;
  iterate(
    versionId: string,
    iteration: number,
    result: ComparisonResult,
  ): Promise<string>;
  finish(
    status: "PASSED" | "FAILED_MAX_ITERATIONS" | "ERROR",
    error?: string,
  ): Promise<void>;
  cleanup(): Promise<void>;
}

export async function runValidationLoop(ports: LoopPorts): Promise<void> {
  const { threshold, maxIterations } = validationLimits(ports.isFreeTier);
  let versionId = ports.startVersionId;
  try {
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      const result = await ports.assess(versionId, iteration);
      const passed = result.score >= threshold;
      await ports.record(versionId, iteration, result, passed);
      if (passed || iteration === maxIterations) {
        await ports.finish(passed ? "PASSED" : "FAILED_MAX_ITERATIONS");
        return;
      }
      versionId = await ports.iterate(versionId, iteration, result);
    }
  } catch (error) {
    await ports.finish(
      "ERROR",
      error instanceof Error ? error.message : "Validation failed",
    );
  } finally {
    await ports.cleanup();
  }
}
