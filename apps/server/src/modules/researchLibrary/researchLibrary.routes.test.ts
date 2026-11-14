import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import express from "express"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const h = vi.hoisted(() => ({
  counts: new Map<string, number>(),
  sql: [] as string[],
  getFinding: vi.fn(async (id: string) => ({ id, claim: "full claim", options: [{ value: "a", label: "A", fits: [] }] })),
  db: {
    plans: [] as Row[],
    payments: [] as Row[],
    projects: [] as Row[],
    reports: [] as Row[],
    citations: [] as Row[],
    sources: [] as Row[],
    findings: [] as Row[],
    relations: [] as Row[],
    articles: [] as Row[],
  },
}))

vi.mock("@/config/env.js", () => ({ env: { NODE_ENV: "test" } }))
vi.mock("@/lib/redis.js", () => ({
  redis: {
    incr: async (key: string) => {
      const next = (h.counts.get(key) ?? 0) + 1
      h.counts.set(key, next)
      return next
    },
    expire: async () => 1,
    ttl: async () => 60,
  },
}))
vi.mock("@/lib/researchService.js", () => ({ callGetFinding: h.getFinding, callGetProjectResearch: vi.fn() }))
vi.mock("@/lib/orchestrator.js", () => ({ callPlan: vi.fn() }))
vi.mock("bullmq", () => ({ Queue: class { add = vi.fn() } }))
vi.mock("@/middleware/authenticate.js", () => ({
  authenticate: (req: { headers: Record<string, string | undefined>; user?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    const id = req.headers["x-test-user"]
    if (!id) return res.status(401).json({ success: false, message: "No token provided" })
    req.user = { id, email: `${id}@example.com`, plan: "FREE" }
    next()
  },
}))

vi.mock("@useframe/db", () => {
  const { db } = h
  const sourceOf = (f: Row) => db.sources.find((s) => s.id === f.sourceDocumentId) ?? null
  const words = (text: unknown) =>
    String(text ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
  const findingBy = (where: Row) =>
    db.findings.find((f) => Object.entries(where).every(([k, v]) => f[k] === v)) ?? null

  return {
    prisma: {
      payment: {
        findFirst: async ({ where }: { where: { userId: string; status: string; plan: { unlocksFullResearch: boolean } } }) =>
          db.payments.find(
            (p) =>
              p.userId === where.userId &&
              p.status === where.status &&
              db.plans.find((pl) => pl.id === p.planId)?.unlocksFullResearch === where.plan.unlocksFullResearch,
          ) ?? null,
      },
      plan: {
        findFirst: async () =>
          [...db.plans]
            .filter((p) => p.isActive && p.unlocksFullResearch)
            .sort((a, b) => Number(b.priceMinor) - Number(a.priceMinor))
            .map((p) => ({ slug: p.slug, name: p.name }))[0] ?? null,
      },
      project: {
        findFirst: async ({ where }: { where: Row }) =>
          db.projects.find((p) => p.slug === where.slug && p.userId === where.userId && p.deletedAt === null) ?? null,
      },
      researchReportCitation: {
        findFirst: async ({ where }: { where: { findingId: string; researchReport: { project: { userId: string } } } }) =>
          db.citations.find((c) => {
            if (c.findingId !== where.findingId) return false
            const report = db.reports.find((r) => r.id === c.researchReportId)
            const project = db.projects.find((p) => p.id === report?.projectId)
            return project?.userId === where.researchReport.project.userId && project?.deletedAt === null
          }) ?? null,
      },
      researchFinding: {
        groupBy: async () => {
          const counts = new Map<string, number>()
          for (const f of db.findings.filter((f) => f.status === "VERIFIED"))
            counts.set(String(f.category), (counts.get(String(f.category)) ?? 0) + 1)
          return [...counts].sort().map(([category, n]) => ({ category, _count: { _all: n } }))
        },
        findFirst: async ({ where }: { where: Row }) => {
          const f = findingBy(where)
          return f ? { id: f.id, slug: f.slug, title: f.title } : null
        },
        findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
          const f = findingBy({ id: where.id })!
          const verified = (id: unknown) => db.findings.find((x) => x.id === id && x.status === "VERIFIED")
          const s = sourceOf(f)
          return {
            ...f,
            source: s && { title: s.title, authors: s.authors, year: s.year, venue: s.venue, url: s.url, doi: s.doi },
            relationsFrom: db.relations
              .filter((r) => r.findingId === f.id && verified(r.relatedFindingId))
              .map((r) => ({ relationType: r.relationType, relatedFinding: { slug: verified(r.relatedFindingId)!.slug, title: verified(r.relatedFindingId)!.title } })),
            relationsTo: db.relations
              .filter((r) => r.relatedFindingId === f.id && verified(r.findingId))
              .map((r) => ({ relationType: r.relationType, finding: { slug: verified(r.findingId)!.slug, title: verified(r.findingId)!.title } })),
          }
        },
      },
      researchArticle: {
        findMany: async ({ where }: { where: Row }) =>
          db.articles.filter((a) => a.isPublished && (!where.category || a.category === where.category)),
        findFirst: async ({ where }: { where: Row }) => db.articles.find((a) => a.slug === where.slug && a.isPublished) ?? null,
      },
      // Mirrors the two list queries: values arrive as category x2, tag x2, q x2, cursor x2, limit.
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?")
        h.sql.push(sql)
        const [category, , tag, , q, , cursor, , take] = values as [string | null, unknown, string | null, unknown, string | null, unknown, string | null, unknown, number]
        const titleTagsOnly = sql.includes(`ts_filter(f."searchVector", '{a}')`)
        const selectsStatement = /SELECT[\s\S]*f\.statement[\s\S]*FROM/.test(sql)
        return db.findings
          .filter((f) => f.status === "VERIFIED")
          .filter((f) => category === null || f.category === category)
          .filter((f) => tag === null || (f.tags as string[]).includes(tag))
          .filter((f) => {
            if (q === null) return true
            const haystack = new Set(
              words([f.title, ...(f.tags as string[]), ...(titleTagsOnly ? [] : [f.statement, f.appliesWhen])].join(" ")),
            )
            return words(q).every((w) => haystack.has(w))
          })
          .filter((f) => cursor === null || String(f.slug) > cursor)
          .sort((a, b) => String(a.slug).localeCompare(String(b.slug)))
          .slice(0, take)
          .map((f) => {
            const s = sourceOf(f)
            const locked = { slug: f.slug, title: f.title, category: f.category, year: s?.year ?? null, venue: s?.venue ?? null }
            return selectsStatement
              ? { ...locked, tags: f.tags, appliesWhen: f.appliesWhen, statement: f.statement, sourceTitle: s?.title ?? null, authors: s?.authors ?? null }
              : locked
          })
      },
    },
  }
})

const { default: libraryRoutes } = await import("./researchLibrary.routes.js")
const { default: articlesRoutes } = await import("../researchArticles/researchArticles.routes.js")
const { default: findingsRoutes } = await import("../findings/findings.routes.js")
const { default: projectRoutes } = await import("../plan/plan.routes.js")
const { errorHandler } = await import("@/middleware/errorHandler.js")

let server: Server
let base = ""

beforeAll(() => {
  const app = express()
  app.use(express.json())
  app.use("/api/research/library", libraryRoutes)
  app.use("/api/research/articles", articlesRoutes)
  app.use("/api/findings", findingsRoutes)
  app.use("/api/projects/:slug/research", projectRoutes)
  app.use(errorHandler)
  server = createServer(app).listen(0)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})

afterAll(() => server.close())

const SECRET = "zebracorn"
const statementOf = (claim: string) =>
  `${claim} ${SECRET}.\n\nOptions:\n- Warm palette: warm (fits: Food, Retail)\n- Cool palette: cool`

function finding(slug: string, extra: Row = {}): Row {
  return {
    id: `id-${slug}`,
    slug,
    title: `Title ${slug}`,
    category: "COLOR_PSYCHOLOGY",
    tags: ["color"],
    appliesWhen: "Landing pages",
    statement: statementOf(`Claim for ${slug} ${"x".repeat(250)}`),
    status: "VERIFIED",
    reuseCount: 0,
    sourceDocumentId: "src-1",
    ...extra,
  }
}

beforeEach(() => {
  h.counts.clear()
  h.sql.length = 0
  h.getFinding.mockClear()
  Object.assign(h.db, {
    plans: [
      { id: "plan-starter", slug: "starter", name: "Starter", priceMinor: 4900, isActive: true, unlocksFullResearch: false },
      { id: "plan-agency", slug: "agency", name: "Agency", priceMinor: 19900, isActive: true, unlocksFullResearch: true },
    ],
    payments: [],
    projects: [
      { id: "proj-a", slug: "alpha", userId: "user-a", deletedAt: null },
      { id: "proj-b", slug: "beta", userId: "user-b", deletedAt: null },
      { id: "proj-gone", slug: "gone", userId: "user-a", deletedAt: new Date() },
    ],
    reports: [
      { id: "rep-a", projectId: "proj-a" },
      { id: "rep-b", projectId: "proj-b" },
      { id: "rep-gone", projectId: "proj-gone" },
    ],
    citations: [
      { id: "c1", researchReportId: "rep-a", findingId: "id-mine" },
      { id: "c2", researchReportId: "rep-b", findingId: "id-theirs" },
      { id: "c3", researchReportId: "rep-gone", findingId: "id-deleted-project" },
    ],
    sources: [{ id: "src-1", title: "A study", authors: "Doe, J.", year: 2021, venue: "CHI", url: "https://example.org/p", doi: "10.1/x" }],
    findings: [
      finding("alpha-colour"),
      finding("beta-type", { category: "TYPOGRAPHY", tags: ["fonts"] }),
      finding("deleted-project", { id: "id-deleted-project" }),
      finding("gamma-layout", { category: "LAYOUT", tags: ["grid", "color"] }),
      finding("mine", { id: "id-mine", reuseCount: 2 }),
      finding("theirs", { id: "id-theirs" }),
      finding("draft-one", { status: "DRAFT" }),
      finding("retired-one", { status: "RETIRED" }),
    ],
    relations: [
      { findingId: "id-mine", relatedFindingId: "id-alpha-colour", relationType: "SUPPORTS" },
      { findingId: "id-mine", relatedFindingId: "id-draft-one", relationType: "REFINES" },
    ],
    articles: [
      {
        slug: "colour-basics",
        title: "Colour basics",
        category: "COLOR_PSYCHOLOGY",
        summary: "Why colour matters.",
        tags: ["color"],
        publishedAt: new Date("2026-11-01T00:00:00Z"),
        updatedAt: new Date("2026-11-02T00:00:00Z"),
        isPublished: true,
        sections: [{ heading: "Intro", body: "Body text" }],
        body: "Full body",
        references: [
          { title: "A study", url: "https://example.org/p", authors: ["Doe, J.", "Roe, K."], publicationYear: 2021, publishedIn: "CHI" },
          { title: "Bad link", url: "javascript:alert(1)" },
          { nothing: true },
        ],
      },
      { slug: "hidden", title: "Hidden", category: "OTHER", summary: "x", tags: [], isPublished: false, sections: [], body: "x", references: [] },
    ],
  })
})

const get = (path: string, user?: string) =>
  fetch(`${base}${path}`, { headers: user ? { "x-test-user": user } : {} })

function entitle(user: string, status = "SUCCESS", planId = "plan-agency") {
  h.db.payments.push({ id: `pay-${h.db.payments.length}`, userId: user, status, planId })
}

describe("research library gating", () => {
  it("requires login", async () => {
    expect((await get("/research/library/findings")).status).toBe(401)
    expect((await get("/research/library/categories")).status).toBe(401)
  })

  it("never sends a locked user statement, options, excerpt, tags or slugs", async () => {
    const res = await get("/research/library/findings?limit=50", "user-a")
    const raw = await res.text()
    const body = JSON.parse(raw)
    expect(res.status).toBe(200)
    expect(body.data.locked).toBe(true)
    expect(body.data.items.length).toBe(6)
    for (const item of body.data.items) expect(Object.keys(item).sort()).toEqual(["category", "locked", "source", "title"])
    expect(body.data.items[0].source).toEqual({ year: 2021, venue: "CHI" })
    for (const leak of [SECRET, "Options", "palette", "excerpt", "statement", "appliesWhen", `"slug"`, `"tags"`]) expect(raw).not.toContain(leak)
    expect(h.sql.at(-1)).not.toMatch(/f\.statement/)
  })

  it("lets a locked user search only titles and tags", async () => {
    const hidden = await (await get(`/research/library/findings?q=${SECRET}`, "user-a")).json()
    expect(hidden.data.items).toHaveLength(0)
    expect(h.sql.at(-1)).toContain(`ts_filter(f."searchVector", '{a}')`)
    const byTitle = await (await get("/research/library/findings?q=gamma", "user-a")).json()
    expect(byTitle.data.items.map((i: Row) => i.title)).toEqual(["Title gamma-layout"])
    const byTag = await (await get("/research/library/findings?q=fonts", "user-a")).json()
    expect(byTag.data.items.map((i: Row) => i.title)).toEqual(["Title beta-type"])
  })

  it("returns 403 RESEARCH_LOCKED on detail without leaking the finding", async () => {
    const res = await get("/research/library/findings/alpha-colour", "user-a")
    const raw = await res.text()
    expect(res.status).toBe(403)
    expect(JSON.parse(raw)).toMatchObject({ success: false, code: "RESEARCH_LOCKED" })
    expect(raw).not.toContain(SECRET)
  })

  it("gives an entitled user full list items, search over the statement and detail", async () => {
    entitle("user-a")
    const list = await (await get("/research/library/findings?limit=50", "user-a")).json()
    expect(list.data.locked).toBe(false)
    const item = list.data.items.find((i: Row) => i.slug === "alpha-colour")
    expect(item).toMatchObject({ locked: false, tags: ["color"], appliesWhen: "Landing pages", source: { title: "A study", year: 2021, venue: "CHI" } })
    expect(item.excerpt.startsWith("Claim for alpha-colour")).toBe(true)
    expect(item.excerpt).not.toContain("Options")
    expect(item.excerpt.length).toBeLessThanOrEqual(201)

    const search = await (await get(`/research/library/findings?q=${SECRET}&limit=50`, "user-a")).json()
    expect(search.data.items).toHaveLength(6)

    const detail = await (await get("/research/library/findings/mine", "user-a")).json()
    expect(detail.data).toMatchObject({
      slug: "mine",
      reuseCount: 2,
      source: { url: "https://example.org/p", doi: "10.1/x" },
      related: [{ slug: "alpha-colour", title: "Title alpha-colour", relationType: "SUPPORTS" }],
    })
    expect(detail.data.statement).toContain("Options:")
  })

  it.each(["REFUNDED", "PARTIALLY_REFUNDED", "FLAGGED", "PENDING", "FAILED"])("does not unlock for a %s payment", async (status) => {
    entitle("user-a", status)
    const body = await (await get("/research/library/findings", "user-a")).json()
    expect(body.data.locked).toBe(true)
    expect((await get("/research/library/findings/alpha-colour", "user-a")).status).toBe(403)
  })

  it("does not unlock for a plan without unlocksFullResearch, and follows the flag, not the slug", async () => {
    entitle("user-a", "SUCCESS", "plan-starter")
    expect((await (await get("/research/library/findings", "user-a")).json()).data.locked).toBe(true)
    h.db.plans[0]!.unlocksFullResearch = true
    expect((await (await get("/research/library/findings", "user-a")).json()).data.locked).toBe(false)
  })

  it("opens findings cited in the user's own projects only", async () => {
    expect((await get("/research/library/findings/mine", "user-a")).status).toBe(200)
    expect((await get("/research/library/findings/theirs", "user-a")).status).toBe(403)
    expect((await get("/research/library/findings/deleted-project", "user-a")).status).toBe(403)
    expect((await get("/research/library/findings/theirs", "user-b")).status).toBe(200)
  })

  it("never returns DRAFT or RETIRED findings", async () => {
    entitle("user-a")
    const list = await (await get("/research/library/findings?limit=50", "user-a")).json()
    expect(list.data.items.map((i: Row) => i.slug)).not.toEqual(expect.arrayContaining(["draft-one", "retired-one"]))
    expect((await get("/research/library/findings/draft-one", "user-a")).status).toBe(404)
    expect((await get("/research/library/findings/retired-one", "user-a")).status).toBe(404)
    expect((await get("/research/library/findings/unknown", "user-a")).status).toBe(404)
    const mine = await (await get("/research/library/findings/mine", "user-a")).json()
    expect(mine.data.related.map((r: Row) => r.slug)).not.toContain("draft-one")
  })

  it("paginates with a cursor and filters by category and tag", async () => {
    entitle("user-a")
    const first = await (await get("/research/library/findings?limit=2", "user-a")).json()
    expect(first.data.items.map((i: Row) => i.slug)).toEqual(["alpha-colour", "beta-type"])
    const second = await (await get(`/research/library/findings?limit=2&cursor=${first.data.nextCursor}`, "user-a")).json()
    expect(second.data.items.map((i: Row) => i.slug)).toEqual(["deleted-project", "gamma-layout"])
    const last = await (await get(`/research/library/findings?limit=50&cursor=${second.data.nextCursor}`, "user-a")).json()
    expect(last.data.nextCursor).toBeNull()

    const layout = await (await get("/research/library/findings?category=LAYOUT", "user-a")).json()
    expect(layout.data.items.map((i: Row) => i.slug)).toEqual(["gamma-layout"])
    const tagged = await (await get("/research/library/findings?tag=grid", "user-a")).json()
    expect(tagged.data.items.map((i: Row) => i.slug)).toEqual(["gamma-layout"])

    expect((await get("/research/library/findings?limit=51", "user-a")).status).toBe(422)
    expect((await get("/research/library/findings?category=NOPE", "user-a")).status).toBe(422)
    expect((await get("/research/library/findings?cursor=%21%21", "user-a")).status).toBe(422)
  })

  it("counts VERIFIED findings per category, reports access and never caches", async () => {
    const res = await get("/research/library/categories", "user-a")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
    expect((await res.json()).data).toEqual([
      { category: "COLOR_PSYCHOLOGY", count: 4 },
      { category: "LAYOUT", count: 1 },
      { category: "TYPOGRAPHY", count: 1 },
    ])
    expect((await (await get("/research/library/access", "user-a")).json()).data).toEqual({
      hasFullAccess: false,
      upgradePlanSlug: "agency",
      upgradePlanName: "Agency",
    })
    entitle("user-a")
    expect((await (await get("/research/library/access", "user-a")).json()).data).toEqual({
      hasFullAccess: true,
      upgradePlanSlug: null,
      upgradePlanName: null,
    })
    expect((await get("/research/library/findings", "user-a")).headers.get("cache-control")).toBe("private, no-store")
  })

  it("rate limits the list at 60 and the detail at 120 per minute", async () => {
    for (let i = 0; i < 60; i++) expect((await get("/research/library/findings", "user-a")).status).toBe(200)
    expect((await get("/research/library/findings", "user-a")).status).toBe(429)
    for (let i = 0; i < 120; i++) await get("/research/library/findings/mine", "user-a")
    expect((await get("/research/library/findings/mine", "user-a")).status).toBe(429)
  })
})

describe("older finding routes", () => {
  it("serves only the slug and title publicly", async () => {
    const res = await get("/findings/id-alpha-colour")
    const raw = await res.text()
    expect(JSON.parse(raw).data).toEqual({ id: "id-alpha-colour", slug: "alpha-colour", title: "Title alpha-colour" })
    expect(raw).not.toContain(SECRET)
    expect((await get("/findings/id-draft-one")).status).toBe(404)
  })

  it("gates the brief editor's finding lookup by project ownership and the access rule", async () => {
    expect((await get("/projects/alpha/research/finding/id-theirs", "user-a")).status).toBe(403)
    expect((await get("/projects/beta/research/finding/id-theirs", "user-a")).status).toBe(404)
    expect(h.getFinding).not.toHaveBeenCalled()
    expect((await get("/projects/alpha/research/finding/id-mine", "user-a")).status).toBe(200)
    entitle("user-a")
    expect((await get("/projects/alpha/research/finding/id-theirs", "user-a")).status).toBe(200)
  })
})

describe("research articles", () => {
  it("lists and renders published articles without login, with safe references", async () => {
    const list = await (await get("/research/articles")).json()
    expect(list.data.map((a: Row) => a.slug)).toEqual(["colour-basics"])
    const res = await get("/research/articles/colour-basics")
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.sections).toEqual([{ heading: "Intro", body: "Body text" }])
    expect(data.references).toEqual([
      { title: "A study", url: "https://example.org/p", authors: "Doe, J., Roe, K.", year: 2021, venue: "CHI", doi: null },
      { title: "Bad link", url: null, authors: null, year: null, venue: null, doi: null },
    ])
    expect((await get("/research/articles/hidden")).status).toBe(404)
    expect((await get("/research/articles/Not_A_Slug")).status).toBe(404)
  })
})
