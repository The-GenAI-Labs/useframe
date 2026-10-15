import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Response } from "express"
import type { SiteSpec } from "@repo/schemas"
import { DATA_PARAGRAPH, FakeLlm, loadMediaAiConfig, readBlueprint, readBlueprintNotice, type Llm, type LlmRequest } from "@repo/media-ai"
import { createMemoryDb } from "@repo/media-ai/testing"

const m = vi.hoisted(() => ({
  db: null as ReturnType<typeof createMemoryDb> | null,
  llm: null as Llm | null,
  enabled: true,
  add: vi.fn(),
}))

vi.mock("@/config/env.js", () => ({
  env: { MEDIA_IMAGES_TIMEOUT_S: 0, MEDIA_VIDEO_TIMEOUT_S: 0 },
  get mediaAiConfig() {
    return { ...loadMediaAiConfig({ MEDIA_ENABLED: "true" }), enabled: m.enabled }
  },
}))
vi.mock("@useframe/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@useframe/db")>()),
  get prisma() {
    return m.db!
  },
  briefStateOf: (row: { data: unknown }) => ({ data: row.data }),
}))
vi.mock("@/llm/claude.js", () => ({
  get mediaLlm() {
    return m.llm!
  },
}))
vi.mock("@/lib/redis.js", () => ({ redis: {} }))
vi.mock("bullmq", () => ({ Queue: class { add = m.add } }))

const { planSiteMedia, copyMediaContext } = await import("./siteMedia.js")
const { DEFAULT_COPY_PROMPT } = await import("@/prompts/copy.prompt.js")

const USER = "user_1"
const PROJECT = "proj_1"
const VERSION = "ver_1"

const pages = () =>
  [
    {
      type: "HOME",
      slug: "home",
      title: "Home",
      sections: [
        { type: "HERO", index: 0, content: { headline: "Books, done" } },
        { type: "FEATURES", index: 1, content: { headline: "Why", items: [] } },
        { type: "CTA", index: 2, content: { headline: "Start" } },
      ],
    },
  ] as SiteSpec["pages"]

const designBrief = {
  colors: { primary: "#2563eb", secondary: "#f1f5f9", accent: "#f97316" },
  typography: { primary: "Inter", secondary: "Inter" },
  avoid: [],
} as unknown as SiteSpec["designBrief"]

function counting(inner: Llm = new FakeLlm()): Llm & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = []
  return { calls, complete: (req) => (calls.push(req), inner.complete(req)) }
}

function res() {
  const writes: string[] = []
  return { writes, res: { destroyed: false, writableEnded: false, write: (s: string) => writes.push(s) } as unknown as Response }
}

async function seed(opts: { balance?: number; brief?: Record<string, unknown>; blueprint?: unknown } = {}) {
  const db = m.db!
  await db.project.create({ data: { id: PROJECT, userId: USER, startupIdea: "Bookkeeping for studios", targetAudience: "Studio owners", niche: null } })
  await db.projectVersion.create({ data: { id: VERSION, projectId: PROJECT, versionNumber: 1, blueprint: opts.blueprint ?? null } })
  await db.creditBalance.create({ data: { userId: USER, balance: opts.balance ?? 1000 } })
  await db.researchReport.create({
    data: {
      projectId: PROJECT,
      primaryColor: "#2563eb",
      secondaryColor: "#f1f5f9",
      accentColor: "#f97316",
      colorPalette: [],
      imageStyle: "Soft natural light, tactile paper objects",
      imageDirection: null,
      styleTagKeys: [],
    },
  })
  if (opts.brief) await db.projectBrief.create({ data: { projectId: PROJECT, userId: USER, status: "APPROVED", data: opts.brief } })
}

const input = (r: Response, tier: "free" | "paid" = "paid") => ({
  res: r,
  userId: USER,
  projectId: PROJECT,
  versionId: VERSION,
  tier,
  spec: { pages: pages(), copyFramework: "AIDA" as const, designBrief },
  briefCtx: null,
})

beforeEach(() => {
  m.db = createMemoryDb()
  m.enabled = true
  m.add.mockReset()
})

describe("planSiteMedia", () => {
  it("makes no blueprint call for free projects, disabled media or media turned off", async () => {
    await seed({ brief: { mediaMode: "OFF" } })
    const llm = counting()
    m.llm = llm
    const r = res()

    expect((await planSiteMedia(input(r.res, "free"))).jobId).toBeNull()
    m.enabled = false
    expect((await planSiteMedia(input(r.res))).jobId).toBeNull()
    m.enabled = true
    expect((await planSiteMedia(input(r.res))).jobId).toBeNull()

    expect(llm.calls).toHaveLength(0)
    expect(r.writes).toHaveLength(0)
    expect(m.db!.mediaJob.rows).toHaveLength(0)
    expect(m.db!.projectVersion.rows[0]!.blueprint).toBeNull()
  })

  it("runs the blueprint over the brief's fixed sections and starts a job", async () => {
    await seed()
    const llm = counting()
    m.llm = llm
    const r = res()
    const spec = input(r.res).spec
    const before = structuredClone(spec.pages)

    const plan = await planSiteMedia({ ...input(r.res), spec })
    expect(plan.jobId).not.toBeNull()
    expect(plan.structure).toBeUndefined()
    expect(spec.pages).toEqual(before)
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]!.routingKey).toBe("blueprint")
    expect(r.writes.join("")).toContain('"substep":"blueprint"')
    expect(readBlueprint(m.db!.projectVersion.rows[0]!.blueprint)?.mode).toBe("brief")

    const job = m.db!.mediaJob.rows[0]!
    expect((job.state as { charges: Record<string, number> }).charges.blueprint).toBe(1)
    expect(m.add).toHaveBeenCalledTimes(1)
  })

  it("skips media with a notice when the blueprint fails twice, and charges nothing", async () => {
    await seed()
    const llm = counting({ complete: async () => ({ text: "not json" }) })
    m.llm = llm
    const plan = await planSiteMedia(input(res().res))
    expect(plan).toEqual({ jobId: null, blueprint: null })
    expect(llm.calls).toHaveLength(2)
    expect(readBlueprintNotice(m.db!.projectVersion.rows[0]!.blueprint)?.notice).toMatch(/couldn't plan AI media/)
    expect(m.db!.mediaJob.rows).toHaveLength(0)
    expect((await m.db!.creditBalance.findUnique({ where: { userId: USER } }))!.balance).toBe(1000)
  })

  it("re-runs a stale blueprint and reuses a fresh one without charging for it", async () => {
    await seed()
    m.llm = counting()
    await planSiteMedia(input(res().res))
    const fresh = m.db!.projectVersion.rows[0]!.blueprint

    m.db = createMemoryDb()
    await seed({ blueprint: fresh })
    const reuse = counting()
    m.llm = reuse
    await planSiteMedia(input(res().res))
    expect(reuse.calls).toHaveLength(0)
    expect((m.db!.mediaJob.rows[0]!.state as { charges: Record<string, number> }).charges.blueprint).toBeUndefined()

    m.db = createMemoryDb()
    await seed({ blueprint: { ...(fresh as object), briefHash: "stale" } })
    const rerun = counting()
    m.llm = rerun
    await planSiteMedia(input(res().res))
    expect(rerun.calls).toHaveLength(1)
  })
})

describe("copy context (Call 2)", () => {
  it("gives the copy agent the narrative and planned media as read-only DATA", async () => {
    await seed()
    m.llm = counting()
    const plan = await planSiteMedia(input(res().res))
    const blueprint = plan.blueprint!
    const sectionWithMedia = blueprint.mediaScript[0]!.slotId.split("/")[1]!
    const context = copyMediaContext(blueprint, null, "home", sectionWithMedia)
    expect(context).toContain(blueprint.narrative.storyArc)
    expect(copyMediaContext(blueprint, null, "home", "footer-9")).toBeUndefined()

    const prompt = DEFAULT_COPY_PROMPT({
      copyFramework: "AIDA",
      startupIdea: "x",
      niche: "y",
      targetAudience: "z",
      pageTitle: "Home",
      pageType: "HOME",
      sectionType: "HERO",
      sectionIndex: 0,
      mediaContext: context,
    })
    expect(prompt).toContain(DATA_PARAGRAPH)
    expect(prompt).toMatch(/<DATA name="VISUALS">[\s\S]*<\/DATA>/)
    expect(prompt).toContain("AIDA framework still decides structure and tone")
  })
})
