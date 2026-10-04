import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refund: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("@useframe/db", () => {
  class RefundRejectedError extends Error {}
  return { refundCredits: mocks.refund, RefundRejectedError, ensureValidationRun: vi.fn() };
});
vi.mock("@/site/sync.js", () => ({ syncSiteToKvs: mocks.sync }));

const { failDeployment } = await import("@/pipeline/lifecycle.js");
const { RefundRejectedError } = await import("@useframe/db");

function fakeDeps(opts: { moved?: number; triggeredBy?: string; active?: string | null } = {}) {
  const db = {
    deployment: {
      findUnique: vi.fn().mockResolvedValue({
        projectId: "p1",
        userId: "u1",
        siteId: "s1",
        triggeredBy: opts.triggeredBy ?? "user",
      }),
      updateMany: vi.fn().mockResolvedValue({ count: opts.moved ?? 1 }),
    },
    projectSite: { findUnique: vi.fn().mockResolvedValue({ activeDeploymentId: opts.active ?? null }) },
    project: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    pipelineState: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const redis = { eval: vi.fn().mockResolvedValue(1), set: vi.fn(), get: vi.fn() };
  return { db, redis, deps: { db, redis, kv: {}, r2: {}, runQueue: {}, config: {} } as never };
}

beforeEach(() => {
  mocks.refund.mockReset().mockResolvedValue({ alreadyRefunded: false });
  mocks.sync.mockReset().mockResolvedValue(new Map());
});

describe("failDeployment", () => {
  it("fails, restores project/pipeline state, releases the lock and refunds", async () => {
    const { deps, db, redis } = fakeDeps();
    expect(await failDeployment(deps, "d1", "The site failed to build.", { buildLog: "log" })).toBe(true);
    expect(db.deployment.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: { in: ["QUEUED", "BUILDING", "UPLOADING", "ACTIVATING"] } },
      data: expect.objectContaining({ status: "FAILED", failureReason: "The site failed to build.", buildLog: "log" }),
    });
    expect(db.project.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", status: "DEPLOYING" },
      data: { status: "READY" },
    });
    expect(db.pipelineState.updateMany).toHaveBeenCalledWith({
      where: { projectId: "p1", deployStatus: "RUNNING" },
      data: { deployStatus: "PENDING" },
    });
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, "deploy:project:p1", "d1");
    expect(mocks.refund).toHaveBeenCalledWith(db, {
      userId: "u1",
      refType: "DEPLOYMENT",
      refId: "d1",
      reason: "Deploy failed",
    });
  });

  it("keeps a previously live site LIVE/APPROVED", async () => {
    const { deps, db } = fakeDeps({ active: "d0" });
    await failDeployment(deps, "d1", "x");
    expect(db.project.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "LIVE" } }));
    expect(db.pipelineState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { deployStatus: "APPROVED" } }),
    );
  });

  it("is a no-op for an already-final deployment", async () => {
    const { deps, redis } = fakeDeps({ moved: 0 });
    expect(await failDeployment(deps, "d1", "x")).toBe(false);
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("never refunds system or rollback triggers, or when told not to", async () => {
    await failDeployment(fakeDeps({ triggeredBy: "domain_change" }).deps, "d1", "x");
    await failDeployment(fakeDeps().deps, "d2", "x", { refund: false });
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it("tolerates a refund with no charge yet (the API refunds after charging)", async () => {
    mocks.refund.mockRejectedValue(new RefundRejectedError("none"));
    await expect(failDeployment(fakeDeps().deps, "d1", "x")).resolves.toBe(true);
  });

  it("puts KV back to the DB state when asked", async () => {
    await failDeployment(fakeDeps().deps, "d1", "x", { resyncKv: true });
    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), "s1");
  });
});
