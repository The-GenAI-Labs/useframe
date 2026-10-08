import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// Runs the real API against a disposable local Postgres + Redis. Skipped
// unless BRIEF_IT_DATABASE_URL points at such a database; never a shared one.
const DB_URL = process.env.BRIEF_IT_DATABASE_URL

describe.skipIf(!DB_URL)("brief API (integration)", { timeout: 30_000 }, () => {
  let api = ""
  let apiServer: Server
  let stub: Server
  const prefillCalls: unknown[] = []
  let db: typeof import("@useframe/db")
  let sign: (u: { id: string; email: string }) => string
  let sharp: typeof import("sharp").default
  const suffix = Math.random().toString(36).slice(2, 8)
  const users = {
    a: { id: `it-a-${suffix}`, email: `a-${suffix}@example.com` },
    b: { id: `it-b-${suffix}`, email: `b-${suffix}@example.com` },
    broke: { id: `it-c-${suffix}`, email: `c-${suffix}@example.com` },
  }

  beforeAll(async () => {
    stub = createServer((req, res) => {
      let body = ""
      req.on("data", (c: Buffer) => (body += c.toString()))
      req.on("end", async () => {
        res.setHeader("Content-Type", "application/json")
        const payload = JSON.parse(body || "{}") as { briefId: string }
        if (req.url === "/brief/prefill") {
          prefillCalls.push(payload)
          res.end(
            JSON.stringify({
              success: true,
              data: {
                values: {
                  productName: "Suggested Name",
                  problem: "Freelancers lose a weekend every quarter on receipts.",
                  existingUrl: "javascript:alert(1)",
                  bogusField: "x",
                },
                confidence: { productName: 0.9, problem: 0.8 },
                excerpts: { problem: "lose a weekend" },
              },
            }),
          )
          return
        }
        if (req.url === "/brief/resolve") {
          const brief = await db.prisma.projectBrief.findUnique({ where: { id: payload.briefId } })
          await db.writeBriefFields({
            briefId: payload.briefId,
            changes: { set: { valueProp: "Monthly books without the weekend of receipts.", audienceSegment: "B2C" } },
            source: "assumed",
            columns: { status: "AWAITING_REVIEW" },
          })
          res.end(JSON.stringify({ success: true, data: { status: brief ? "AWAITING_REVIEW" : "SKIPPED" } }))
          return
        }
        res.statusCode = 404
        res.end(JSON.stringify({ success: false, message: "not found" }))
      })
    }).listen(0)
    const stubPort = (stub.address() as AddressInfo).port

    Object.assign(process.env, {
      DATABASE_URL: DB_URL,
      REDIS_URL: process.env.BRIEF_IT_REDIS_URL ?? "redis://localhost:6379",
      ORCHESTRATOR_URL: `http://127.0.0.1:${stubPort}`,
      JWT_ACCESS_SECRET: "integration-access-secret-0123456789abcdef",
      JWT_REFRESH_SECRET: "integration-refresh-secret-0123456789abcdef",
      GOOGLE_CLIENT_ID: "x",
      GOOGLE_CLIENT_SECRET: "x",
      GITHUB_CLIENT_ID: "x",
      GITHUB_CLIENT_SECRET: "x",
      RESEND_API_KEY: "x",
      TURNSTILE_SECRET_KEY: "x",
    })

    db = await import("@useframe/db")
    const { default: app } = await import("@/app.js")
    const jwt = await import("@/lib/jwt.js")
    sharp = (await import("sharp")).default
    sign = (u) => jwt.signAccessToken({ id: u.id, email: u.email, plan: "FREE" })

    for (const u of Object.values(users)) {
      await db.prisma.user.create({ data: { id: u.id, name: "IT" } })
    }
    await db.prisma.user.update({ where: { id: users.broke.id }, data: { hasUsedFreeGeneration: true } })

    apiServer = app.listen(0)
    api = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}/api`
  }, 90_000)

  afterAll(async () => {
    if (!db) return
    await db.prisma.project.deleteMany({ where: { userId: { in: Object.values(users).map((u) => u.id) } } })
    await db.prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u) => u.id) } } })
    apiServer?.close()
    stub?.close()
    await db.prisma.$disconnect()
  }, 30_000)

  async function call(user: { id: string; email: string } | null, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${api}${path}`, {
      method,
      headers: {
        ...(user ? { Authorization: `Bearer ${sign(user)}` } : {}),
        ...(body !== undefined && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: any; errors?: Record<string, string[]>; code?: string } | null
    return { status: res.status, json, headers: res.headers }
  }

  const answers = {
    productName: "Ledgerly",
    oneLiner: "Ledgerly turns bank exports into tidy monthly books.",
    productType: "SOFTWARE_SAAS",
    availability: "LIVE",
    primaryGoal: "FREE_TRIAL",
    audienceDescription: "Freelance designers",
    problem: "Freelancers lose a weekend every quarter on receipts.",
    features: [
      { title: "Auto-categorise", benefit: "Bank lines sorted without effort." },
      { title: "Receipt match", benefit: "Photos matched to the right line." },
    ],
    ctaPrimary: { label: "Start free", type: "URL", url: "https://ledgerly.app/signup" },
  }

  let briefId = ""
  let version = 0

  it("creates a draft seeded from the idea and the account email", async () => {
    const r = await call(users.a, "POST", "/briefs", { ideaText: "Ledgerly turns bank exports into tidy books." })
    expect(r.status).toBe(201)
    const brief = r.json!.data.brief
    briefId = brief.id
    version = brief.version
    expect(brief.data.oneLiner).toBe("Ledgerly turns bank exports into tidy books.")
    expect(brief.meta.oneLiner).toMatchObject({ source: "user", confirmed: true })
    expect(brief.data.contactEmail).toBe(users.a.email)
    expect(brief.meta.contactEmail.source).toBe("default")
  })

  it("autosaves with optimistic concurrency", async () => {
    const ok = await call(users.a, "PATCH", `/briefs/${briefId}`, { expectedVersion: version, set: { productName: "Ledgerly" }, currentStep: "about" })
    expect(ok.status).toBe(200)
    expect(ok.json!.data.brief.version).toBe(version + 1)
    const stale = await call(users.a, "PATCH", `/briefs/${briefId}`, { expectedVersion: version, set: { productName: "Other" } })
    expect(stale.status).toBe(409)
    expect(stale.json!.code).toBe("BRIEF_CONFLICT")
    expect(stale.json!.data.data.productName).toBe("Ledgerly")
    version = ok.json!.data.brief.version
  })

  it("rejects unsafe values with field errors", async () => {
    const r = await call(users.a, "PATCH", `/briefs/${briefId}`, { expectedVersion: version, set: { existingUrl: "javascript:alert(1)" } })
    expect(r.status).toBe(422)
    expect(r.json!.errors!.existingUrl).toBeDefined()
  })

  it("hides one user's brief from another (404, not 403)", async () => {
    for (const [method, path, body] of [
      ["GET", `/briefs/${briefId}`, undefined],
      ["PATCH", `/briefs/${briefId}`, { expectedVersion: version, set: { productName: "Mine" } }],
      ["DELETE", `/briefs/${briefId}`, undefined],
      ["POST", `/briefs/${briefId}/prefill`, { kind: "text", text: "hello there" }],
    ] as const) {
      const r = await call(users.b, method, path, body)
      expect(r.status, `${method} ${path}`).toBe(404)
    }
    const upload = await call(users.b, "POST", `/briefs/${briefId}/uploads?field=sourceDocument&name=a.txt`, new Uint8Array(Buffer.from("hi")), { "Content-Type": "application/octet-stream" })
    expect(upload.status).toBe(404)
    const create = await call(users.b, "POST", "/projects", { briefId })
    expect(create.status).toBe(404)
  })

  it("merges pre-fill as unconfirmed suggestions and never over the user's own answers", async () => {
    const r = await call(users.a, "POST", `/briefs/${briefId}/prefill`, { kind: "text", text: "Ledgerly helps freelancers who lose a weekend to receipts." })
    expect(r.status).toBe(200)
    const brief = r.json!.data.brief
    expect(brief.data.productName).toBe("Ledgerly")
    expect(brief.meta.productName.source).toBe("user")
    expect(brief.data.problem).toBe("Freelancers lose a weekend every quarter on receipts.")
    expect(brief.meta.problem).toMatchObject({ source: "imported", confirmed: false, excerpt: "lose a weekend" })
    expect(brief.data.existingUrl).toBeUndefined()
    expect(brief.data).not.toHaveProperty("bogusField")
    version = brief.version
  })

  it("stores a re-encoded logo behind a signed URL and rejects disguised files", async () => {
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#123456" } })
      .withMetadata({ exif: { IFD0: { Copyright: "secret-exif" } } })
      .png()
      .toBuffer()
    const ok = await call(users.a, "POST", `/briefs/${briefId}/uploads?field=logo&name=logo.png`, new Uint8Array(png), { "Content-Type": "image/png" })
    expect(ok.status).toBe(201)
    const brief = ok.json!.data.brief
    expect(brief.data.logo).toMatchObject({ mime: "image/png", width: 1024, height: 512 })
    const img = await fetch(`${api.replace(/\/api$/, "")}${brief.uploads.logo.url}`)
    expect(img.status).toBe(200)
    expect(img.headers.get("content-type")).toBe("image/png")
    expect(Buffer.from(await img.arrayBuffer()).includes(Buffer.from("secret-exif"))).toBe(false)
    const tampered = await fetch(`${api.replace(/\/api$/, "")}${brief.uploads.logo.url.replace(/sig=[^&]+/, "sig=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")}`)
    expect(tampered.status).toBe(404)

    const fake = await call(users.a, "POST", `/briefs/${briefId}/uploads?field=logo&name=logo.png`, new Uint8Array(Buffer.from("<svg onload=alert(1)>")), { "Content-Type": "image/png" })
    expect(fake.status).toBe(415)
    const big = await call(users.a, "POST", `/briefs/${briefId}/uploads?field=logo&name=big.png`, new Uint8Array(Buffer.alloc(2_200_000, 1)), { "Content-Type": "image/png" })
    expect(big.status).toBe(413)
    const notDocx = await call(users.a, "POST", `/briefs/${briefId}/uploads?field=sourceDocument&name=a.docx`, new Uint8Array(Buffer.from("%PDF-1.4")), { "Content-Type": "application/octet-stream" })
    expect(notDocx.status).toBe(415)
    version = (await call(users.a, "GET", `/briefs/${briefId}`)).json!.data.brief.version
  })

  it("refuses to create a project from an incomplete brief", async () => {
    const r = await call(users.a, "POST", "/projects", { briefId })
    expect(r.status).toBe(422)
    expect(r.json!.errors!.primaryGoal).toBeDefined()
  })

  let slug = ""

  it("creates the project, resolves, gates research and requires claim confirmation", async () => {
    const filled = await call(users.a, "PATCH", `/briefs/${briefId}`, { expectedVersion: version, set: answers })
    expect(filled.status).toBe(200)

    const created = await call(users.a, "POST", "/projects", { briefId })
    expect(created.status).toBe(201)
    slug = created.json!.data.project.slug
    expect(created.json!.data.tier).toBe("free")

    let brief: any
    for (let i = 0; i < 40; i++) {
      brief = (await call(users.a, "GET", `/projects/${slug}/brief`)).json!.data.brief
      if (brief.status !== "RESOLVING") break
      await new Promise((r) => setTimeout(r, 100))
    }
    expect(brief.status).toBe("AWAITING_REVIEW")
    expect(brief.needsConfirmation).toEqual(["valueProp"])

    const project = await db.prisma.project.findFirst({ where: { slug } })
    expect(project).toMatchObject({ name: "Ledgerly", targetAudience: "Freelance designers", inputType: "FROM_SCRATCH" })
    expect(project.startupIdea).toContain("Problem:")

    const research = await call(users.a, "POST", `/projects/${slug}/research/generate`, {})
    expect(research.status).toBe(409)
    expect(research.json!.code).toBe("BRIEF_NOT_APPROVED")

    const blocked = await call(users.a, "POST", `/projects/${slug}/brief/approve`, { expectedVersion: brief.version, confirmedPaths: [] })
    expect(blocked.status).toBe(422)
    expect(blocked.json!.errors!.valueProp).toBeDefined()

    const approved = await call(users.a, "POST", `/projects/${slug}/brief/approve`, { expectedVersion: brief.version, confirmedPaths: ["valueProp"] })
    expect(approved.status).toBe(200)
    expect(approved.json!.data.brief.status).toBe("APPROVED")
    expect(approved.json!.data.brief.meta.valueProp).toMatchObject({ source: "assumed", confirmed: true })
    expect(approved.json!.data.brief.latestRevision.reason).toBe("APPROVED")
  })

  it("edits after creation create a revision and keep proof rules strict", async () => {
    const current = (await call(users.a, "GET", `/projects/${slug}/brief`)).json!.data.brief
    const noAttest = await call(users.a, "PATCH", `/projects/${slug}/brief`, {
      expectedVersion: current.version,
      set: { testimonials: [{ quote: "Saved my weekends.", personName: "Ana", permissionConfirmed: true }] },
    })
    expect(noAttest.status).toBe(422)
    expect(noAttest.json!.errors!.proofAttested).toBeDefined()

    const edited = await call(users.a, "PATCH", `/projects/${slug}/brief`, { expectedVersion: current.version, set: { productName: "Ledgerly Books" } })
    expect(edited.status).toBe(200)
    expect(edited.json!.data.brief.latestRevision.reason).toBe("EDITED")
    expect(edited.json!.data.regenerateNeeded).toBe(false)
    const project = await db.prisma.project.findFirst({ where: { slug } })
    expect(project.name).toBe("Ledgerly Books")
  })

  it("keeps the brief as a draft when the free-tier/credit gate refuses", async () => {
    const d = (await call(users.broke, "POST", "/briefs", {})).json!.data.brief
    await call(users.broke, "PATCH", `/briefs/${d.id}`, { expectedVersion: d.version, set: answers })
    const r = await call(users.broke, "POST", "/projects", { briefId: d.id })
    expect(r.status).toBe(403)
    expect(r.json!.code).toBe("FREE_TIER_EXHAUSTED")
    const after = await db.prisma.projectBrief.findUnique({ where: { id: d.id } })
    expect(after).toMatchObject({ status: "DRAFT", projectId: null })
    const eligibility = await call(users.broke, "GET", "/generate/eligibility")
    expect(eligibility.json!.data).toEqual({ eligible: false })
  })

  it("caps open drafts at five and lists them", async () => {
    const open = await call(users.broke, "GET", "/briefs")
    for (let i = open.json!.data.drafts.length; i < 5; i++) {
      expect((await call(users.broke, "POST", "/briefs", {})).status).toBe(201)
    }
    const sixth = await call(users.broke, "POST", "/briefs", {})
    expect(sixth.status).toBe(409)
    expect(sixth.json!.code).toBe("BRIEF_DRAFT_LIMIT")
    expect(sixth.json!.data.drafts).toHaveLength(5)
  })

  it("still accepts the legacy create body and gives it a brief", async () => {
    await db.prisma.user.update({ where: { id: users.b.id }, data: { hasUsedFreeGeneration: false } })
    const r = await call(users.b, "POST", "/projects", {
      name: "Legacy",
      startupIdea: "A legacy idea that is long enough",
      niche: "SAAS_B2B",
      targetAudience: "Founders",
      inputType: "FROM_SCRATCH",
    })
    expect(r.status).toBe(201)
    const brief = (await call(users.b, "GET", `/projects/${r.json!.data.project.slug}/brief`)).json!.data.brief
    expect(brief.status).toBe("APPROVED")
    expect(brief.resolution.origin).toBe("legacy")
    expect(brief.data.productName).toBe("Legacy")
  })

  it("rate-limits URL pre-fill with Retry-After", async () => {
    const d = (await call(users.b, "POST", "/briefs", {})).json!.data.brief
    let last: Awaited<ReturnType<typeof call>> | null = null
    for (let i = 0; i < 4; i++) {
      last = await call(users.b, "POST", `/briefs/${d.id}/prefill`, { kind: "url", url: "https://example.com" })
    }
    expect(last!.status).toBe(429)
    expect(Number(last!.headers.get("retry-after"))).toBeGreaterThan(0)
  })
})
