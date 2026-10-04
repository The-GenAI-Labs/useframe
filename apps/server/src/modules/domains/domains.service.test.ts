import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  hasBalance: vi.fn(),
  set: vi.fn(),
  add: vi.fn(),
  check: vi.fn(),
}))

vi.mock("@useframe/db", () => ({ prisma: { project: { findFirst: m.findFirst } } }))
vi.mock("@/lib/redis.js", () => ({ redis: { set: m.set } }))
vi.mock("@/middleware/errorHandler.js", () => ({
  AppError: class extends Error {
    constructor(
      message: string,
      public statusCode: number,
      public code?: string
    ) {
      super(message)
    }
  },
}))
vi.mock("@/modules/credits/credits.service.js", () => ({
  CreditsService: { hasSufficientBalance: m.hasBalance },
}))
vi.mock("@/modules/deploy/deploy.service.js", () => ({ DEPLOY_CREDIT_COST: 1 }))
vi.mock("@/lib/deployService.js", () => ({
  addProjectDomain: m.add,
  checkProjectDomain: m.check,
}))

const { DomainsService } = await import("./domains.service.js")

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.findFirst.mockResolvedValue({ id: "p1", pipelineState: { currentStep: "DEPLOY" } })
  m.hasBalance.mockResolvedValue(true)
  m.add.mockResolvedValue({ id: "dom1" })
  m.check.mockResolvedValue({ id: "dom1" })
})

describe("DomainsService", () => {
  it("adds through the deploy service with the deploy entitlement", async () => {
    await expect(DomainsService.add("u1", "acme", "www.acme.com")).resolves.toEqual({ id: "dom1" })
    expect(m.add).toHaveBeenCalledWith("p1", "www.acme.com")
  })

  it("refuses before the DEPLOY step or without the balance a deploy needs", async () => {
    m.findFirst.mockResolvedValue({ id: "p1", pipelineState: { currentStep: "SEO" } })
    await expect(DomainsService.add("u1", "acme", "www.acme.com")).rejects.toMatchObject({ statusCode: 409 })
    m.findFirst.mockResolvedValue({ id: "p1", pipelineState: { currentStep: "DEPLOY" } })
    m.hasBalance.mockResolvedValue(false)
    await expect(DomainsService.add("u1", "acme", "www.acme.com")).rejects.toMatchObject({ statusCode: 402 })
    expect(m.add).not.toHaveBeenCalled()
  })

  it("only finds the caller's own project", async () => {
    m.findFirst.mockResolvedValue(null)
    await expect(DomainsService.check("u2", "acme", "dom1")).rejects.toMatchObject({ statusCode: 404 })
    expect(m.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: "acme", userId: "u2", deletedAt: null } })
    )
  })

  it("rate-limits Check now to once per 10 seconds per domain", async () => {
    m.set.mockResolvedValueOnce("OK").mockResolvedValueOnce(null)
    await DomainsService.check("u1", "acme", "dom1")
    await expect(DomainsService.check("u1", "acme", "dom1")).rejects.toMatchObject({
      statusCode: 429,
      code: "check_cooldown",
    })
    expect(m.set).toHaveBeenCalledWith("ratelimit:domain-check:dom1", "1", "EX", 10, "NX")
    expect(m.check).toHaveBeenCalledTimes(1)
  })
})
