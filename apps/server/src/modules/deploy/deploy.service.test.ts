import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  transaction: vi.fn(),
  updateMany: vi.fn(),
  refund: vi.fn(),
  hasBalance: vi.fn(),
  deduct: vi.fn(),
  reload: vi.fn(),
  request: vi.fn(),
  cancel: vi.fn(),
  getDeployment: vi.fn(),
}))

vi.mock("@useframe/db", () => ({
  prisma: { project: { findFirst: m.findFirst }, $transaction: m.transaction },
  refundCredits: m.refund,
}))
vi.mock("@/middleware/errorHandler.js", () => ({
  AppError: class extends Error {
    constructor(
      message: string,
      public statusCode: number
    ) {
      super(message)
    }
  },
}))
vi.mock("@/modules/credits/credits.service.js", () => ({
  CreditsService: { hasSufficientBalance: m.hasBalance, deduct: m.deduct, triggerAutoReload: m.reload },
}))
vi.mock("@/lib/deployService.js", () => ({
  requestDeployment: m.request,
  cancelDeployment: m.cancel,
  getDeployment: m.getDeployment,
}))

const { DeployService } = await import("./deploy.service.js")

const user = { id: "u1", email: "a@b.c", plan: "free" }

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.findFirst.mockResolvedValue({
    id: "p1",
    currentVersionId: "v1",
    pipelineState: { currentStep: "DEPLOY", deployStatus: "PENDING" },
  })
  m.hasBalance.mockResolvedValue(true)
  m.request.mockResolvedValue({ deploymentId: "d1", status: "QUEUED", host: "acme-x7k.useframe.in" })
  m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ creditTransaction: { updateMany: m.updateMany } })
  )
  m.deduct.mockResolvedValue({ balanceAfter: 4, autoReloadTopUpCents: null })
  m.getDeployment.mockResolvedValue({ id: "d1", status: "BUILDING" })
  m.cancel.mockResolvedValue({ id: "d1", status: "FAILED" })
})

describe("DeployService.create", () => {
  it("charges 1 credit only after the deploy service accepts, tagged to the deployment", async () => {
    const result = await DeployService.create(user, "acme")
    expect(m.request).toHaveBeenCalledWith({ projectId: "p1", versionId: "v1", userId: "u1" })
    expect(m.request.mock.invocationCallOrder[0]!).toBeLessThan(m.deduct.mock.invocationCallOrder[0]!)
    expect(m.deduct).toHaveBeenCalledWith(expect.anything(), "u1", 1, "Deploy", "d1")
    expect(m.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", type: "SPEND", refId: "d1", refType: null },
      data: { refType: "DEPLOYMENT" },
    })
    expect(m.refund).not.toHaveBeenCalled()
    expect(result).toEqual({ deploymentId: "d1", status: "BUILDING", host: "acme-x7k.useframe.in" })
  })

  it("allows a redeploy after approval", async () => {
    m.findFirst.mockResolvedValue({
      id: "p1",
      currentVersionId: "v1",
      pipelineState: { currentStep: "DEPLOY", deployStatus: "APPROVED" },
    })
    await expect(DeployService.create(user, "acme")).resolves.toMatchObject({ deploymentId: "d1" })
  })

  it("keeps the pipeline lock and adds a balance gate on top", async () => {
    m.findFirst.mockResolvedValue({
      id: "p1",
      currentVersionId: "v1",
      pipelineState: { currentStep: "SEO", deployStatus: "LOCKED" },
    })
    await expect(DeployService.create(user, "acme")).rejects.toMatchObject({ statusCode: 409 })

    m.findFirst.mockResolvedValue({
      id: "p1",
      currentVersionId: "v1",
      pipelineState: { currentStep: "DEPLOY", deployStatus: "PENDING" },
    })
    m.hasBalance.mockResolvedValue(false)
    await expect(DeployService.create(user, "acme")).rejects.toMatchObject({ statusCode: 402 })
    expect(m.request).not.toHaveBeenCalled()
  })

  it("never charges a 409 from the deploy service", async () => {
    m.request.mockRejectedValue(Object.assign(new Error("in progress"), { statusCode: 409 }))
    await expect(DeployService.create(user, "acme")).rejects.toMatchObject({ statusCode: 409 })
    expect(m.deduct).not.toHaveBeenCalled()
  })

  it("cancels the deployment when the charge fails after the 202", async () => {
    m.deduct.mockRejectedValue(Object.assign(new Error("Insufficient credits"), { statusCode: 402 }))
    await expect(DeployService.create(user, "acme")).rejects.toMatchObject({ statusCode: 402 })
    expect(m.cancel).toHaveBeenCalledWith("p1", "d1")
    expect(m.refund).not.toHaveBeenCalled()
  })

  it("refunds when the deployment already failed before the charge landed", async () => {
    m.getDeployment.mockResolvedValue({ id: "d1", status: "FAILED" })
    await DeployService.create(user, "acme")
    expect(m.refund).toHaveBeenCalledWith(expect.anything(), {
      userId: "u1",
      refType: "DEPLOYMENT",
      refId: "d1",
      reason: "Deploy failed",
    })
  })
})
