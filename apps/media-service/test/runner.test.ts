import { describe, expect, it } from "vitest"
import { FakeImageProvider, FakeLlm, FakeVideoProvider, readJobState, type VideoProvider } from "@repo/media-ai"
import { runMediaJob } from "@/generate/runner.js"
import { sweepMediaJobs } from "@/generate/sweep.js"
import { harness, image, until, video } from "./mediaAi.harness.js"

const HERO = "home/hero-0/background"
const FEATURE = "home/features-1/item-0"
const STEP = "home/how_it_works-2/item-0"
const CTA = "home/cta-3/background"

describe("runMediaJob (AUTO)", () => {
  it("makes every item, binds them and adds a new version", async () => {
    const h = await harness({ items: [image("img-1", FEATURE), video("vid-1", HERO)] })
    await runMediaJob(h.deps, h.jobId)
    const job = await h.job()
    expect(job.status).toBe("DONE")
    expect(Object.keys(job.bindings as object).sort()).toEqual([FEATURE, HERO].sort())
    expect(h.videoProvider instanceof FakeVideoProvider && h.videoProvider.submits).toHaveLength(1)

    const versions = h.db.projectVersion.rows
    expect(versions).toHaveLength(2)
    expect(versions[1]!.label).toBe("Media added")
    expect(job.resultVersionId).toBe(versions[1]!.id)
    expect(h.db.project.rows[0]!.currentVersionId).toBe(versions[1]!.id)
    expect(job.creditsRefunded).toBe(0)
    expect(await h.balance()).toBe(1000 - h.reserved)
  })

  it("writes concepts one video at a time so each video gets a different mechanism", async () => {
    const llm = new FakeLlm()
    const h = await harness({ llm, items: [video("vid-1", HERO, 1), video("vid-2", STEP, 2)] })
    await runMediaJob(h.deps, h.jobId)
    const state = readJobState((await h.job()).state)
    const chosen = Object.values(state.items).map((s) => s.concept!.concepts.find((c) => c.id === s.concept!.chosenId)!.mechanism)
    expect(new Set(chosen).size).toBe(2)
    const conceptCalls = llm.calls.filter((c) => c.purpose === "media.concepts")
    expect(conceptCalls).toHaveLength(2)
    expect(chosen.some((m) => conceptCalls[1]!.system.includes(m))).toBe(true)
  })

  it("respects the image concurrency limit", async () => {
    const h = await harness({ imageLimit: 1, items: [image("a", FEATURE), image("b", "home/features-1/item-1"), image("c", CTA)] })
    await runMediaJob(h.deps, h.jobId)
    expect((await h.job()).status).toBe("DONE")
    expect(h.imageSemaphore.peak).toBe(1)
  })

  it("refunds a refused image and keeps the rest of the site", async () => {
    const images = new FakeImageProvider({ refuse: (p) => p.includes("for a") })
    const h = await harness({ images, items: [image("a", FEATURE), image("b", CTA)] })
    await runMediaJob(h.deps, h.jobId)
    const job = await h.job()
    const state = readJobState(job.state)
    expect(job.status).toBe("DONE")
    expect(state.items.a!.status).toBe("FAILED")
    expect(state.items.b!.status).toBe("DONE")
    expect(job.creditsRefunded).toBe(state.charges.a)
    expect(Object.keys(job.bindings as object)).toEqual([CTA])
  })

  it("falls back to the opening still when the video fails, and refunds the item", async () => {
    const h = await harness({ video: new FakeVideoProvider({ outcome: () => "FAILED" }), items: [video("vid-1", HERO)] })
    await runMediaJob(h.deps, h.jobId)
    const job = await h.job()
    const s = readJobState(job.state).items["vid-1"]!
    expect(s.status).toBe("FAILED")
    expect(s.fallbackAssetId).toBe(s.frames!.openingAssetId)
    expect((job.bindings as Record<string, { assetId: string }>)[HERO]!.assetId).toBe(s.frames!.openingAssetId)
    expect(job.creditsRefunded).toBe(h.reserved)
    expect(await h.balance()).toBe(1000)
  })

  it("refunds an item only once even if refunds run twice", async () => {
    const h = await harness({ video: new FakeVideoProvider({ outcome: () => "FAILED" }), items: [video("vid-1", HERO)] })
    await runMediaJob(h.deps, h.jobId)
    await sweepMediaJobs(h.deps.db, new Date(Date.now() + 365 * 24 * 3600_000))
    expect(await h.balance()).toBe(1000)
    expect(h.db.creditTransaction.rows.filter((t) => t.type === "REFUND")).toHaveLength(1)
  })
})

describe("runMediaJob resume", () => {
  it("polls the stored task after a crash instead of submitting again", async () => {
    const provider = new FakeVideoProvider()
    let hang = true
    const flaky: VideoProvider = {
      name: provider.name,
      model: provider.model,
      taskIdFor: (k) => provider.taskIdFor(k),
      submit: (req) => provider.submit(req),
      poll: (id) => (hang ? new Promise(() => undefined) : provider.poll(id)),
    }
    const h = await harness({ video: flaky, items: [video("vid-1", HERO)] })
    void runMediaJob(h.deps, h.jobId)
    await until(async () => h.db.mediaGeneration.rows.find((r) => r.stage === "VIDEO" && r.status === "RUNNING"))

    hang = false
    await runMediaJob(h.deps, h.jobId)
    expect((await h.job()).status).toBe("DONE")
    expect(provider.submits).toHaveLength(1)
  })

  it("resubmits with the same task id when the provider lost the task", async () => {
    const first = new FakeVideoProvider()
    let hang = true
    const h = await harness({
      video: { name: "fake", model: "fake-video", taskIdFor: (k) => first.taskIdFor(k), submit: (r) => first.submit(r), poll: (id) => (hang ? new Promise(() => undefined) : first.poll(id)) },
      items: [video("vid-1", HERO)],
    })
    void runMediaJob(h.deps, h.jobId)
    const row = await until(async () => h.db.mediaGeneration.rows.find((r) => r.stage === "VIDEO" && r.status === "RUNNING"))

    hang = false
    const second = new FakeVideoProvider()
    await runMediaJob({ ...h.deps, video: second }, h.jobId)
    expect((await h.job()).status).toBe("DONE")
    expect(second.submits.map((s) => s.taskId)).toEqual([row.providerTaskId])
  })
})

describe("runMediaJob (MANUAL)", () => {
  it("stops at each checkpoint and finishes after approvals", async () => {
    const h = await harness({ mode: "MANUAL", items: [image("img-1", FEATURE), video("vid-1", HERO)] })
    const step = async () => {
      await runMediaJob(h.deps, h.jobId)
      return h.job()
    }

    expect((await step()).checkpoint).toBe("PLAN_APPROVE")
    await h.act({ checkpoint: "PLAN_APPROVE", action: "approve" })

    let job = await step()
    expect(job.checkpoint).toBe("CONCEPT_PICK")
    expect(job.checkpointExpiresAt).toBeInstanceOf(Date)
    await h.act({ checkpoint: "CONCEPT_PICK", action: "pick", itemId: "vid-1", conceptId: "B" })
    await expect(h.act({ checkpoint: "IMAGES_APPROVE", action: "approve" })).rejects.toMatchObject({ status: 409 })
    await h.act({ checkpoint: "CONCEPT_PICK", action: "approve" })

    expect((await step()).checkpoint).toBe("IMAGES_APPROVE")
    await h.act({ checkpoint: "IMAGES_APPROVE", action: "approve" })

    expect((await step()).checkpoint).toBe("VIDEO_APPROVE")
    await h.act({ checkpoint: "VIDEO_APPROVE", action: "approve" })

    job = await step()
    expect(job.status).toBe("DONE")
    expect(readJobState(job.state).items["vid-1"]!.concept!.chosenId).toBe("B")
  })

  it("dropping an item at plan approval refunds it", async () => {
    const h = await harness({ mode: "MANUAL", items: [image("img-1", FEATURE), image("img-2", CTA)] })
    await runMediaJob(h.deps, h.jobId)
    await h.act({ checkpoint: "PLAN_APPROVE", action: "drop", itemId: "img-2" })
    const state = readJobState((await h.job()).state)
    expect(state.items["img-2"]!.status).toBe("DROPPED")
    expect(await h.balance()).toBe(1000 - h.reserved + state.charges["img-2"]!)
  })

  it("expired approvals cancel the job and refund everything unspent", async () => {
    const h = await harness({ mode: "MANUAL", items: [image("img-1", FEATURE)] })
    await runMediaJob(h.deps, h.jobId)
    const res = await sweepMediaJobs(h.deps.db, new Date(Date.now() + 73 * 3600_000))
    expect(res.expired).toBe(1)
    expect((await h.job()).status).toBe("CANCELLED")
    expect(await h.balance()).toBe(1000)
  })

  it("a cancelled job stops before the next stage", async () => {
    const h = await harness({ items: [image("img-1", FEATURE)] })
    await h.db.mediaJob.update({ where: { id: h.jobId }, data: { status: "CANCELLED" } })
    await runMediaJob(h.deps, h.jobId)
    expect(h.images.calls).toHaveLength(0)
  })
})

describe("runMediaJob paid check", () => {
  it("still runs when the reservation used the last credits", async () => {
    const probe = await harness({ items: [image("img-1", FEATURE)] })
    const h = await harness({ balance: probe.reserved, items: [image("img-1", FEATURE)] })
    expect(await h.balance()).toBe(0)
    await runMediaJob(h.deps, h.jobId)
    expect((await h.job()).status).toBe("DONE")
  })
})
