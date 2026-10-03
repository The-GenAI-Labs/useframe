import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  project: vi.fn(),
  version: vi.fn(),
  upsert: vi.fn(),
  ensure: vi.fn(),
  add: vi.fn(),
}));
vi.mock("../../db/src/index.js", () => ({
  prisma: {
    project: { findUniqueOrThrow: mocks.project },
    projectVersion: { findFirstOrThrow: mocks.version },
    validationRun: { upsert: mocks.upsert },
  },
  ensureValidationRun: mocks.ensure,
}));
vi.mock("../../../apps/orchestrator-service/src/config/env.js", () => ({
  env: { GCS_BUCKET: "fixture" },
}));
vi.mock("../../../apps/orchestrator-service/src/lib/redis.js", () => ({
  redis: {},
}));
vi.mock("../../../apps/orchestrator-service/node_modules/bullmq", () => ({
  Queue: class {
    add = mocks.add;
  },
}));
import { ensureValidationRun } from "../../db/src/validation.js";
import { enqueueValidation } from "../../../apps/orchestrator-service/src/lib/validationQueue.js";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.project.mockResolvedValue({ generationTier: "PAID", deletedAt: null });
  mocks.version.mockResolvedValue({ triggeredBy: null });
  mocks.upsert.mockImplementation(async ({ create }) => ({
    ...create,
    id: "run",
    status: "QUEUED",
  }));
  mocks.ensure.mockImplementation(ensureValidationRun);
});
describe("MAIN paid-only gate", () => {
  it("creates no row and enqueues no job for a free generation", async () => {
    mocks.project.mockResolvedValue({
      generationTier: "FREE",
      deletedAt: null,
    });
    expect(await ensureValidationRun("project", "version", "MAIN")).toBeNull();
    await enqueueValidation("project", "version", "MAIN");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("creates fixed paid limits and enqueues paid MAIN", async () => {
    await enqueueValidation("project", "version", "MAIN");
    expect(mocks.upsert.mock.calls[0]![0].create).toMatchObject({
      pipeline: "MAIN",
      isFreeTier: false,
      threshold: 95,
      maxIterations: 3,
    });
    expect(mocks.add).toHaveBeenCalledOnce();
  });
  it("preserves free Replicate validation at 90/2", async () => {
    mocks.project.mockResolvedValue({
      generationTier: "FREE",
      deletedAt: null,
    });
    await enqueueValidation("project", "version", "REPLICATE");
    expect(mocks.upsert.mock.calls[0]![0].create).toMatchObject({
      pipeline: "REPLICATE",
      isFreeTier: true,
      threshold: 90,
      maxIterations: 2,
    });
    expect(mocks.add).toHaveBeenCalledOnce();
  });
  it("does not recursively validate auto-corrected versions", async () => {
    mocks.version.mockResolvedValue({ triggeredBy: "auto_validation" });
    await enqueueValidation("project", "version", "MAIN");
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
