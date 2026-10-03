import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  claim: vi.fn(),
  update: vi.fn(),
  version: vi.fn(),
  record: vi.fn(),
  transaction: vi.fn(),
  checks: vi.fn(),
  request: vi.fn(),
  preview: vi.fn(),
  kill: vi.fn(),
  close: vi.fn(),
  screenshot: vi.fn(),
  upload: vi.fn(),
  cleanup: vi.fn(),
  launch: vi.fn(),
}));
vi.mock("../../db/src/index.js", () => ({
  prisma: {
    validationRun: {
      findUniqueOrThrow: mocks.run,
      updateMany: mocks.claim,
      update: mocks.update,
    },
    projectVersion: { findFirstOrThrow: mocks.version },
    validationIteration: { create: mocks.record },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../../schemas/dist/index.js", () => ({
  SiteSpecSchema: { parse: (value: unknown) => value },
}));
vi.mock("../../site-builder/dist/index.js", () => ({
  buildSiteFiles: () => [
    { path: "package.json", content: '{"scripts":{"dev":"vite --host"}}' },
  ],
  toRoutePath: () => "/",
}));
vi.mock("../dist/index.js", async (original) => ({
  ...(await original<typeof import("./index.js")>()),
  runTier0Checks: mocks.checks,
}));
vi.mock("../dist/localPreview.js", () => ({
  startLocalPreview: mocks.preview,
}));
vi.mock("../dist/storage.js", () => ({
  validationPrefix: () => "validation/main/project/run/",
  SCREENSHOT_TTL_MS: 7200000,
  uploadToGcs: mocks.upload,
  deleteGcsPrefix: mocks.cleanup,
}));
vi.mock("playwright", () => ({ chromium: { launch: mocks.launch } }));
vi.mock("../../../apps/worker/src/lib/validationRequest.js", () => ({
  validationRequest: mocks.request,
}));
import { processMainValidation } from "../../../apps/worker/src/processors/mainValidation.processor.js";
const ids = [
  "c000000000000000000000001",
  "c000000000000000000000002",
  "c000000000000000000000003",
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.run.mockResolvedValue({
    id: "run",
    projectId: "project",
    startVersionId: ids[0],
    pipeline: "MAIN",
    status: "QUEUED",
    isFreeTier: false,
    startedAt: new Date(),
    project: { generationTier: "PAID", deletedAt: null },
  });
  mocks.claim.mockResolvedValue({ count: 1 });
  mocks.update.mockResolvedValue({});
  mocks.record.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (values) => Promise.all(values));
  mocks.version.mockImplementation(async ({ where }) => ({
    id: where.id,
    snapshot: { pages: [{ slug: "home" }] },
    siteType: "SINGLE_PAGE",
  }));
  mocks.checks.mockResolvedValue({ passed: true, issues: [] });
  mocks.preview.mockResolvedValue({
    url: "http://127.0.0.1:3000",
    port: 3000,
    kill: mocks.kill,
  });
  mocks.launch.mockResolvedValue({
    close: mocks.close,
    newPage: async () => ({
      evaluate: async (_callback: unknown, y?: number) =>
        y === undefined ? 1600 : undefined,
      waitForTimeout: async () => {},
      screenshot: mocks.screenshot,
    }),
  });
  mocks.screenshot.mockResolvedValue(Buffer.from("rendered fixture"));
  mocks.upload.mockImplementation(async (key) => key);
  mocks.cleanup.mockResolvedValue(undefined);
  mocks.request.mockImplementation(async (path, body) =>
    path === "/iterate"
      ? { id: ids[body.iteration] }
      : { score: 99, discrepancies: [], summary: "Complete" },
  );
});
describe("MAIN processor with mocked browser, storage and LLM", () => {
  it("passes after capturing all sections in one assessment", async () => {
    await processMainValidation("run");
    expect(mocks.screenshot).toHaveBeenCalledTimes(2);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.checks.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.request.mock.invocationCallOrder[0]!,
    );
    expect(mocks.claim.mock.calls[0]![0].data).toMatchObject({
      status: "RUNNING",
      threshold: 95,
      maxIterations: 3,
    });
    expect(mocks.update.mock.calls.at(-1)![0].data.status).toBe("PASSED");
    expect(mocks.record.mock.calls[0]![0].data).toMatchObject({
      iterationNumber: 1,
      resultingVersionId: null,
      score: 99,
      passed: true,
    });
    expect(mocks.kill).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
    expect(mocks.preview.mock.calls[0]).toHaveLength(2);
  });
  it("caps Tier 0 failures, corrects the right base versions and stops after three", async () => {
    mocks.checks.mockResolvedValue({
      passed: false,
      issues: [{ check: "console_error", detail: "Render failed" }],
    });
    await processMainValidation("run");
    expect(mocks.record.mock.calls.map(([arg]) => arg.data.score)).toEqual([
      60, 60, 60,
    ]);
    const iterations = mocks.request.mock.calls.filter(
      ([path]) => path === "/iterate",
    );
    expect(
      iterations.map(([, body]) => ({
        baseVersionId: body.baseVersionId,
        iteration: body.iteration,
        triggeredBy: body.triggeredBy,
      })),
    ).toEqual([
      { baseVersionId: ids[0], iteration: 1, triggeredBy: "auto_validation" },
      { baseVersionId: ids[1], iteration: 2, triggeredBy: "auto_validation" },
    ]);
    expect(mocks.update.mock.calls.at(-1)![0].data.status).toBe(
      "FAILED_MAX_ITERATIONS",
    );
    expect(mocks.preview).toHaveBeenCalledTimes(3);
    expect(mocks.kill).toHaveBeenCalledTimes(3);
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
  it("cleans up screenshots and preview when vision errors", async () => {
    mocks.request.mockRejectedValue(new Error("malformed vision output"));
    await processMainValidation("run");
    expect(mocks.update.mock.calls.at(-1)![0].data.status).toBe("ERROR");
    expect(mocks.kill).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
  it("cleans up after preview startup errors", async () => {
    mocks.preview.mockRejectedValue(new Error("renderer unavailable"));
    await processMainValidation("run");
    expect(mocks.update.mock.calls.at(-1)![0].data.status).toBe("ERROR");
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
  it("does not assess stale free MAIN runs", async () => {
    const run = await mocks.run();
    mocks.run.mockResolvedValue({ ...run, isFreeTier: true });
    await processMainValidation("run");
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
});
