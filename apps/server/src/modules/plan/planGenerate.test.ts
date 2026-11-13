import { describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  pipelineUpdate: vi.fn(async (_args: unknown) => ({})),
  transaction: vi.fn(async (_ops: unknown, _options?: unknown) => {
    throw new Error("Transaction API error: Unable to start a transaction in the given time.")
  }),
}))
vi.mock("@useframe/db", () => ({
  prisma: {
    project: {
      findFirst: async () => ({
        id: "p1",
        slug: "kids",
        currentVersionId: "v1",
        startupIdea: "A kids learning app",
        niche: "EDTECH",
        targetAudience: "Parents",
        pipelineState: { currentStep: "RESEARCH", researchStatus: "PENDING" },
      }),
    },
    projectBrief: { findUnique: async () => null },
    pipelineState: { update: m.pipelineUpdate },
    projectVersion: { update: vi.fn(() => ({})) },
    $transaction: m.transaction,
  },
}))
vi.mock("bullmq", () => ({ Queue: class {} }))
vi.mock("@/lib/redis.js", () => ({ redis: {} }))
vi.mock("@/lib/jwt.js", () => ({ signAccessToken: () => "token" }))
vi.mock("@/lib/orchestrator.js", () => ({
  callPlan: vi.fn(async () => ({ brief: { product: "Kids app" }, candidates: undefined })),
}))
vi.mock("@/lib/researchService.js", () => ({
  callGetFinding: vi.fn(),
  callGetProjectResearch: vi.fn(),
  callSaveCitations: vi.fn(),
}))

const { PlanService } = await import("./plan.service.js")

describe("PlanService.generate", () => {
  it("waits longer for the final write and resets the status when it still fails", async () => {
    await expect(
      PlanService.generate({ id: "u1", email: "u@x.test", plan: "free" }, "kids"),
    ).rejects.toThrow("Unable to start a transaction")
    expect(m.transaction).toHaveBeenCalledWith(expect.any(Array), { maxWait: 10000, timeout: 30000 })
    expect(m.pipelineUpdate).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { researchStatus: "RUNNING" } }))
    expect(m.pipelineUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { researchStatus: "PENDING" } }),
    )
  })
})
