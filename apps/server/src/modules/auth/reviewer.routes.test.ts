import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import bcrypt from "bcryptjs"
import cookieParser from "cookie-parser"
import express from "express"
import jwt from "jsonwebtoken"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const h = vi.hoisted(() => {
    const password = "reviewer-test-password"
    return {
        password,
        env: {
            NODE_ENV: "test",
            CLIENT_URL: "http://localhost:3000",
            FRONTEND_URL: "http://localhost:3000",
            JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdefghij",
            JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdefghi",
            JWT_ACCESS_EXPIRY: "15m",
            JWT_REFRESH_EXPIRY: "7d",
            BCRYPT_ROUNDS: "4",
            GOOGLE_CLIENT_ID: "test",
            GOOGLE_CLIENT_SECRET: "test",
            GOOGLE_REDIRECT_URI: "http://localhost:4000/api/auth/google/callback",
            GITHUB_CLIENT_ID: "test",
            GITHUB_CLIENT_SECRET: "test",
            GITHUB_REDIRECT_URI: "http://localhost:4000/api/auth/github/callback",
            REVIEWER_LOGIN_ENABLED: true,
            REVIEWER_EMAIL: "reviewer@useframe.in",
            REVIEWER_PASSWORD_HASH: "",
            REVIEWER_STARTING_CREDITS: 20,
        },
        counts: new Map<string, number>(),
        db: {
            users: [] as Row[],
            identities: [] as Row[],
            sessions: [] as Row[],
            refreshTokens: [] as Row[],
            balances: new Map<string, Row>(),
            txns: [] as Row[],
        },
        nextId: { value: 0 },
    }
})

vi.mock("@/config/env.js", () => ({ env: h.env }))
vi.mock("@/lib/redis.js", () => ({
    redis: {
        incr: async (key: string) => {
            const next = (h.counts.get(key) ?? 0) + 1
            h.counts.set(key, next)
            return next
        },
        expire: async () => 1,
        ttl: async () => 900,
    },
}))
vi.mock("@/security/assessSignupRisk.js", () => ({
    assessSignupRisk: async () => ({ decision: "ALLOW", score: 0, reasons: [] }),
}))
vi.mock("@useframe/db", () => {
    const { db } = h
    const id = (prefix: string) => `${prefix}${++h.nextId.value}`
    const createIdentity = (data: Row) => {
        const row = { id: id("idn"), createdAt: new Date(), ...data }
        db.identities.push(row)
        return row
    }
    const prisma = {
        identity: {
            findUnique: async ({ where }: { where: { type_externalId: Row } }) => {
                const { type, externalId } = where.type_externalId
                const identity = db.identities.find((i) => i.type === type && i.externalId === externalId)
                return identity ? { user: db.users.find((u) => u.id === identity.userId) } : null
            },
            findFirst: async ({ where }: { where: Row }) =>
                db.identities.find((i) =>
                    Object.entries(where).every(([k, v]) => i[k] === v)
                ) ?? null,
            create: async ({ data }: { data: Row }) => createIdentity(data),
        },
        user: {
            findUnique: async ({ where }: { where: Row }) => db.users.find((u) => u.id === where.id) ?? null,
            update: async ({ where, data }: { where: Row; data: Row }) => {
                const user = db.users.find((u) => u.id === where.id)!
                Object.assign(user, data)
                return user
            },
            create: async ({ data }: { data: Row & { identities: { create: Row } } }) => {
                const { identities, ...rest } = data
                const user = { id: id("usr"), ...rest }
                db.users.push(user)
                createIdentity({ ...identities.create, userId: user.id })
                return user
            },
        },
        session: {
            create: async ({ data }: { data: Row }) => {
                const row = { id: id("ses"), ...data }
                db.sessions.push(row)
                return row
            },
        },
        refreshToken: {
            create: async ({ data }: { data: Row }) => {
                db.refreshTokens.push(data)
                return data
            },
        },
        signupRiskEvent: { create: async ({ data }: { data: Row }) => data },
        creditBalance: {
            upsert: async ({ where, create, update }: { where: { userId: string }; create: Row; update: { balance: { increment: number } } }) => {
                const existing = db.balances.get(where.userId)
                if (existing) existing.balance = (existing.balance as number) + update.balance.increment
                else db.balances.set(where.userId, { ...create })
                return db.balances.get(where.userId)!
            },
        },
        creditTransaction: {
            findFirst: async ({ where }: { where: Row }) =>
                db.txns.find((t) => Object.entries(where).every(([k, v]) => t[k] === v)) ?? null,
            create: async ({ data }: { data: Row }) => {
                db.txns.push(data)
                return data
            },
        },
        $queryRaw: async () => [],
        $transaction: async (arg: unknown): Promise<unknown> =>
            Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => Promise<unknown>)(prisma),
    }
    return { prisma }
})

const { default: authRoutes } = await import("./auth.routes.js")
const { errorHandler } = await import("@/middleware/errorHandler.js")

let server: Server
let base = ""
const audits: Row[] = []

beforeAll(() => {
    h.env.REVIEWER_PASSWORD_HASH = bcrypt.hashSync(h.password, 4)
    const app = express()
    app.set("trust proxy", true)
    app.use(express.json())
    app.use(cookieParser())
    app.use("/api/auth", authRoutes)
    app.use(errorHandler)
    server = createServer(app).listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth/reviewer-login`
    vi.spyOn(console, "info").mockImplementation((line: unknown) => {
        audits.push(JSON.parse(String(line)) as Row)
    })
})

afterAll(() => {
    server.close()
    vi.restoreAllMocks()
})

beforeEach(() => {
    h.env.REVIEWER_LOGIN_ENABLED = true
    h.counts.clear()
    audits.length = 0
    h.db.users.length = 0
    h.db.identities.length = 0
    h.db.sessions.length = 0
    h.db.refreshTokens.length = 0
    h.db.balances.clear()
    h.db.txns.length = 0
})

function login(body: Row, ip = "203.0.113.1") {
    return fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ acceptedTerms: true, ...body }),
    })
}

const reviewer = () => ({ email: h.env.REVIEWER_EMAIL, password: h.password })

describe("reviewer login", () => {
    it("answers 404 like an unknown route when disabled, without counting or creating anything", async () => {
        h.env.REVIEWER_LOGIN_ENABLED = false
        const status = await fetch(base)
        const res = await login(reviewer())
        expect(status.status).toBe(404)
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ success: false, message: "Route not found" })
        expect(h.counts.size).toBe(0)
        expect(h.db.users).toHaveLength(0)
        expect(audits).toHaveLength(0)
    })

    it("reports itself enabled with an empty 204", async () => {
        const res = await fetch(base)
        expect(res.status).toBe(204)
    })

    it("rejects a wrong password with a generic error", async () => {
        const res = await login({ ...reviewer(), password: "wrong-password" })
        expect(res.status).toBe(401)
        expect(await res.json()).toMatchObject({ success: false, message: "Invalid email or password" })
        expect(res.headers.get("set-cookie")).toBeNull()
        expect(h.db.sessions).toHaveLength(0)
        expect(audits).toEqual([expect.objectContaining({ audit: "auth.reviewer_login", outcome: "invalid_credentials", email: h.env.REVIEWER_EMAIL, ip: "203.0.113.1" })])
        expect(JSON.stringify(audits)).not.toContain("wrong-password")
    })

    it("never accepts another email, even with the reviewer password", async () => {
        for (const email of ["someone@useframe.in", "reviewer@useframe.in.evil.com", "hi@useframe.in"]) {
            const res = await login({ email, password: h.password }, `198.51.100.${email.length}`)
            expect(res.status).toBe(401)
            expect(await res.json()).toMatchObject({ message: "Invalid email or password" })
        }
        expect(h.db.users).toHaveLength(0)
        expect(h.db.sessions).toHaveLength(0)
    })

    it("allows 5 attempts per IP in 15 minutes, then refuses even the right password", async () => {
        for (let i = 0; i < 5; i++) {
            expect((await login({ email: `guess${i}@example.com`, password: "nope" })).status).toBe(401)
        }
        const limited = await login(reviewer())
        expect(limited.status).toBe(429)
        expect(await limited.json()).toMatchObject({ message: "Too many sign-in attempts. Please try again later." })
        expect(limited.headers.get("retry-after")).toBe("900")
        expect(h.db.sessions).toHaveLength(0)
        expect(audits.at(-1)).toMatchObject({ outcome: "rate_limited" })
        expect((await login(reviewer(), "203.0.113.99")).status).toBe(200)
    })

    it("allows 5 attempts per email in 15 minutes across IPs", async () => {
        for (let i = 0; i < 5; i++) {
            expect((await login({ ...reviewer(), password: "nope" }, `192.0.2.${i}`)).status).toBe(401)
        }
        const limited = await login(reviewer(), "192.0.2.50")
        expect(limited.status).toBe(429)
        expect(h.db.sessions).toHaveLength(0)
    })

    it("issues the normal session for the right email and password", async () => {
        const res = await login({ email: "Reviewer@UseFrame.in", password: h.password })
        expect(res.status).toBe(200)
        const body = (await res.json()) as { data: { accessToken: string; user: Row } }
        const claims = jwt.verify(body.data.accessToken, h.env.JWT_ACCESS_SECRET) as Row
        expect(claims).toMatchObject({ email: h.env.REVIEWER_EMAIL, type: "access" })
        expect(body.data.user).toMatchObject({ id: claims.id, email: h.env.REVIEWER_EMAIL })

        const cookie = res.headers.get("set-cookie") ?? ""
        expect(cookie).toMatch(/^refresh_token=[0-9a-f]{64};/)
        expect(cookie).toContain("HttpOnly")
        expect(h.db.sessions).toEqual([expect.objectContaining({ userId: claims.id })])
        expect(h.db.refreshTokens).toEqual([expect.objectContaining({ userId: claims.id })])
        expect(h.db.identities).toEqual([
            expect.objectContaining({ userId: claims.id, type: "EMAIL", externalId: h.env.REVIEWER_EMAIL, email: h.env.REVIEWER_EMAIL }),
        ])
        expect(h.db.users[0]).toMatchObject({ acceptedTermsVersion: expect.any(String) })
        expect(audits).toEqual([expect.objectContaining({ outcome: "success", userId: claims.id, creditsGranted: 20 })])
    })

    it("grants the starting credits once, through the ledger", async () => {
        expect((await login(reviewer())).status).toBe(200)
        expect((await login(reviewer())).status).toBe(200)
        const userId = h.db.users[0]!.id as string
        expect(h.db.users).toHaveLength(1)
        expect(h.db.balances.get(userId)).toMatchObject({ balance: 20 })
        expect(h.db.txns).toEqual([
            expect.objectContaining({
                userId,
                delta: 20,
                type: "ADJUSTMENT",
                reason: "Payment provider reviewer starting credits",
                balanceAfter: 20,
                refType: "REVIEWER_GRANT",
            }),
        ])
        expect(audits.map((a) => a.creditsGranted)).toEqual([20, 0])
    })

    it("requires the terms to be accepted", async () => {
        const res = await fetch(base, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(reviewer()),
        })
        expect(res.status).toBe(422)
        expect(h.db.sessions).toHaveLength(0)
    })
})
