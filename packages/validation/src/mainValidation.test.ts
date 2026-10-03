import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Page } from "playwright";
import {
  runMainValidationLoop,
  validateMainAssessment,
  UnsupportedValidationCorrection,
  MAIN_VALIDATION_LIMITS,
} from "./mainValidation.js";
import { runTier0Checks } from "./tier0Checks.js";
import { detectPreviewCommand } from "./previewCommand.js";
const result = (score: number) => ({
  score,
  discrepancies: [
    {
      section: "hero",
      issue: "Placeholder heading",
      severity: "major" as const,
    },
  ],
  summary: "Checked",
});
function ports(scores: number[]) {
  return {
    startVersionId: "v1",
    assess: vi.fn(async (_id: string, iteration: number) =>
      result(scores[iteration - 1]!),
    ),
    record: vi.fn(async () => {}),
    iterate: vi.fn(
      async (_id: string, iteration: number) => `v${iteration + 1}`,
    ),
    finish: vi.fn(async () => {}),
    cleanup: vi.fn(async () => {}),
  };
}
describe("paid MAIN loop", () => {
  it("uses fixed 95/3 limits and passes first assessment without correction", async () => {
    expect(MAIN_VALIDATION_LIMITS).toEqual({ threshold: 95, maxIterations: 3 });
    const p = ports([95]);
    await runMainValidationLoop(p);
    expect(p.iterate).not.toHaveBeenCalled();
    expect(p.finish).toHaveBeenCalledWith("PASSED");
    expect(p.cleanup).toHaveBeenCalledOnce();
  });
  it("assesses three successive versions then stops", async () => {
    const p = ports([94, 94, 94]);
    await runMainValidationLoop(p);
    expect(p.assess.mock.calls).toEqual([
      ["v1", 1],
      ["v2", 2],
      ["v3", 3],
    ]);
    expect(p.iterate).toHaveBeenCalledTimes(2);
    expect(p.finish).toHaveBeenCalledWith("FAILED_MAX_ITERATIONS");
    expect(p.cleanup).toHaveBeenCalledOnce();
  });
  it("ends unsupported corrections without architecture changes", async () => {
    const p = ports([50]);
    p.iterate.mockRejectedValue(
      new UnsupportedValidationCorrection("Content-only restriction"),
    );
    await runMainValidationLoop(p);
    expect(p.assess).toHaveBeenCalledOnce();
    expect(p.finish).toHaveBeenCalledWith(
      "FAILED_MAX_ITERATIONS",
      "Content-only restriction",
    );
    expect(p.cleanup).toHaveBeenCalledOnce();
  });
  it("cleans up on rendering and persistence failures", async () => {
    const p = ports([]);
    p.assess.mockRejectedValue(new Error("preview unavailable"));
    await runMainValidationLoop(p);
    expect(p.finish).toHaveBeenCalledWith("ERROR", "preview unavailable");
    expect(p.cleanup).toHaveBeenCalledOnce();
    const q = ports([100]);
    q.finish.mockRejectedValue(new Error("database unavailable"));
    await expect(runMainValidationLoop(q)).rejects.toThrow(
      "database unavailable",
    );
    expect(q.cleanup).toHaveBeenCalledOnce();
  });
});
describe("vision output validation", () => {
  const valid = { score: 95, issues: [], summary: "Complete" };
  it("accepts one valid response", async () => {
    const generate = vi.fn(async () => valid);
    expect(await validateMainAssessment(generate)).toEqual(valid);
    expect(generate).toHaveBeenCalledOnce();
  });
  it("retries malformed output once", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ ...valid, score: 101 })
      .mockResolvedValue(valid);
    expect(await validateMainAssessment(generate)).toEqual(valid);
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it("fails cleanly after two invalid outputs and skips retries for provider failures", async () => {
    const generate = vi.fn(async () => ({ issues: [] }));
    await expect(validateMainAssessment(generate)).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(2);
    const outage = vi.fn(async () => {
      throw new Error("provider unavailable");
    });
    await expect(validateMainAssessment(outage)).rejects.toThrow(
      "provider unavailable",
    );
    expect(outage).toHaveBeenCalledOnce();
  });
});
describe("manifest-driven previews", () => {
  it.each([
    ["vite --host", "vite"],
    ["next dev --turbopack", "next"],
  ])("detects %s", (script, framework) =>
    expect(
      detectPreviewCommand([
        {
          path: "package.json",
          content: JSON.stringify({ scripts: { dev: script } }),
        },
      ]),
    ).toEqual({ script, framework }),
  );
  it("rejects missing or unsupported dev scripts", () => {
    expect(() => detectPreviewCommand([])).toThrow();
    expect(() =>
      detectPreviewCommand([
        {
          path: "package.json",
          content: '{"scripts":{"dev":"custom-server"}}',
        },
      ]),
    ).toThrow("Unsupported");
  });
});
describe("Tier 0 independent checks", () => {
  it.each([
    "console_error",
    "page_error",
    "broken_asset",
    "layout_overflow",
    "page_load",
  ])("detects %s and removes listeners", async (check) => {
    const events = new EventEmitter();
    let evaluations = 0;
    const page = Object.assign(events, {
      goto: async () => {
        if (check === "console_error")
          events.emit("console", {
            type: () => "error",
            text: () => "render failed",
          });
        if (check === "page_error")
          events.emit("pageerror", new Error("runtime failed"));
        return { ok: () => check !== "page_load", status: () => 500 };
      },
      waitForLoadState: async () => {},
      waitForTimeout: async () => {},
      evaluate: async (_fn: unknown, value?: number) => {
        if (value !== undefined) return;
        evaluations++;
        if (evaluations === 1) return 800;
        if (evaluations === 2)
          return check === "broken_asset"
            ? ["https://fixture.invalid/image.png"]
            : [];
        if (evaluations === 3) return check === "layout_overflow";
      },
    });
    const result = await runTier0Checks(
      "http://127.0.0.1:3000",
      page as unknown as Page,
    );
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.check)).toEqual([check]);
    expect(events.eventNames()).toHaveLength(0);
  });
});
