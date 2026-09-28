import { describe, expect, it, vi } from "vitest";
import {
  decideValidationTier,
  FULL_PAGE_THRESHOLD,
} from "../../../../../packages/validation/src/decideTier";
import {
  runValidationLoop,
  validationLimits,
  type LoopPorts,
} from "../../../../../packages/validation/src/runValidationLoop";
import {
  ComparisonResultSchema,
  formatDiscrepanciesAsIterateInstruction,
} from "../../../../../packages/validation/src/compareSchema";

const simple = {
  pageHeightPx: 800,
  fullPageThresholdPx: FULL_PAGE_THRESHOLD,
  usesAnimationLibrary: false,
  usesVirtualization: false,
  hasPinnedElements: false,
  capturedFrameCount: 1,
  aiSelfReportedConfidence: "verified" as const,
};
describe("validation tier selection", () => {
  it("always checks simple pages visually regardless of confidence", () => {
    expect(decideValidationTier(simple)).toBe(1);
    expect(
      decideValidationTier({
        ...simple,
        aiSelfReportedConfidence: "uncertain",
      }),
    ).toBe(1);
  });
  it.each([
    { pageHeightPx: FULL_PAGE_THRESHOLD + 1 },
    { usesAnimationLibrary: true },
    { usesVirtualization: true },
    { hasPinnedElements: true },
    { capturedFrameCount: 2 },
  ])("does not downgrade a verified complex page: %j", (signal) => {
    expect(decideValidationTier({ ...simple, ...signal })).toBe(2);
  });
});
const result = (score: number) => ({
  score,
  summary: "Checked",
  discrepancies: [
    {
      section: "hero",
      issue: "Use approved blue background",
      severity: "major" as const,
    },
  ],
});
function ports(isFreeTier: boolean, scores: number[]) {
  const inputs: string[] = [];
  const p: LoopPorts = {
    startVersionId: "original",
    isFreeTier,
    assess: vi.fn(async (id, iteration) => {
      inputs.push(id);
      return result(scores[iteration - 1]!);
    }),
    record: vi.fn(async () => {}),
    iterate: vi.fn(async (_id, iteration) => `auto-${iteration}`),
    finish: vi.fn(async () => {}),
    cleanup: vi.fn(async () => {}),
  };
  return { p, inputs };
}
describe("bounded quality loop", () => {
  it.each([
    [true, 90, 2],
    [false, 95, 3],
  ] as const)(
    "uses exact limits for free=%s",
    (free, threshold, maxIterations) => {
      expect(validationLimits(free)).toEqual({ threshold, maxIterations });
    },
  );
  it("passes at the free threshold without a correction", async () => {
    const { p } = ports(true, [90]);
    await runValidationLoop(p);
    expect(p.iterate).not.toHaveBeenCalled();
    expect(p.finish).toHaveBeenCalledWith("PASSED");
    expect(p.cleanup).toHaveBeenCalledOnce();
  });
  it.each([
    [true, 2],
    [false, 3],
  ] as const)("stops free=%s after %s assessments", async (free, cap) => {
    const { p, inputs } = ports(free, [60, 60, 60]);
    await runValidationLoop(p);
    expect(p.assess).toHaveBeenCalledTimes(cap);
    expect(p.iterate).toHaveBeenCalledTimes(cap - 1);
    expect(inputs).toEqual(["original", "auto-1", "auto-2"].slice(0, cap));
    expect(p.finish).toHaveBeenCalledWith("FAILED_MAX_ITERATIONS");
    expect(p.cleanup).toHaveBeenCalledOnce();
  });
  it("cleans up after a rendering error", async () => {
    const { p } = ports(true, []);
    p.assess = vi.fn().mockRejectedValue(new Error("render failed"));
    await runValidationLoop(p);
    expect(p.finish).toHaveBeenCalledWith("ERROR", "render failed");
    expect(p.iterate).not.toHaveBeenCalled();
    expect(p.cleanup).toHaveBeenCalledOnce();
  });
  it("cleans up even if persistence fails", async () => {
    const { p } = ports(true, [100]);
    p.finish = vi.fn().mockRejectedValue(new Error("database unavailable"));
    await expect(runValidationLoop(p)).rejects.toThrow("database unavailable");
    expect(p.cleanup).toHaveBeenCalledOnce();
  });
  it("rejects malformed scores and keeps actionable correction detail", () => {
    expect(ComparisonResultSchema.safeParse(result(101)).success).toBe(false);
    expect(ComparisonResultSchema.safeParse(result(94.5)).success).toBe(false);
    expect(
      formatDiscrepanciesAsIterateInstruction(result(60).discrepancies),
    ).toContain("[hero] (major) Use approved blue background");
  });
});
