import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Response } from "express"
import type { GenerateRequest } from "@repo/schemas"

const findFirst = vi.fn()
vi.mock("@useframe/db", () => ({
  prisma: { projectVersion: { findFirst } },
  briefStateOf: () => ({}),
  latestBriefRevision: async () => null,
  writeBriefFields: async () => ({}),
}))
const resolveTierModel = vi.fn(async () => {
  throw new Error("passed the guard")
})
vi.mock("@/llm/router.js", () => ({ resolveTierModel }))

const { runOrchestrator } = await import("./orchestrator.js")

function fakeRes() {
  const writes: string[] = []
  const res = {
    destroyed: false,
    writableEnded: false,
    write: (chunk: string) => writes.push(chunk),
    end: vi.fn(),
  }
  return { res: res as unknown as Response, writes, end: res.end }
}

const request = {
  projectId: "p1",
  versionId: "v1",
  startupIdea: "idea",
  niche: "SAAS",
  targetAudience: "devs",
  inputType: "FROM_SCRATCH",
  tier: "paid",
} as GenerateRequest

describe("runOrchestrator project guard", () => {
  beforeEach(() => {
    findFirst.mockReset()
    resolveTierModel.mockClear()
  })

  it("scopes the version lookup to the caller's live project", async () => {
    findFirst.mockResolvedValue(null)
    const { res } = fakeRes()
    await runOrchestrator(res, request, "user-1")
    expect(findFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "v1", projectId: "p1", project: { userId: "user-1", deletedAt: null } },
    })
  })

  it("refuses a project the caller does not own", async () => {
    findFirst.mockResolvedValue(null)
    const { res, writes, end } = fakeRes()
    await runOrchestrator(res, request, "user-1")
    expect(writes.join("")).toContain("Project not found")
    expect(end).toHaveBeenCalled()
    expect(resolveTierModel).not.toHaveBeenCalled()
  })

  it("refuses while the Website step is still locked behind Research", async () => {
    findFirst.mockResolvedValue({ project: { pipelineState: { websiteStatus: "LOCKED" } } })
    const { res, writes } = fakeRes()
    await runOrchestrator(res, request, "user-1")
    expect(writes.join("")).toContain("Finish the Research step")
    expect(resolveTierModel).not.toHaveBeenCalled()
  })

  it.each([
    { pipelineState: { websiteStatus: "PENDING" } },
    { pipelineState: null },
  ])("proceeds once the step is unlocked or the project has no pipeline (%o)", async (project) => {
    findFirst.mockResolvedValue({ project })
    const { res } = fakeRes()
    await expect(runOrchestrator(res, request, "user-1")).rejects.toThrow("passed the guard")
    expect(resolveTierModel).toHaveBeenCalled()
  })
})
