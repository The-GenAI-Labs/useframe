import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import express from "express"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
    env: { NODE_ENV: "test", AUTO_RELOAD_ENABLED: false },
    setting: { enabled: true, thresholdCents: 1000, topUpToCents: 2500 },
    billing: {
        callGetAutoReload: vi.fn(async () => ({ enabled: true, thresholdCents: 1000, topUpToCents: 2500 })),
        callPutAutoReload: vi.fn(async () => ({ enabled: true, thresholdCents: 1000, topUpToCents: 2500 })),
        callCreateSetupIntent: vi.fn(async () => ({ orderId: "order_1" })),
        callCreateCheckout: vi.fn(async () => ({ orderId: "order_2" })),
    },
}))

vi.mock("@/config/env.js", () => ({ env: h.env }))
vi.mock("@/lib/redis.js", () => ({ redis: {} }))
vi.mock("bullmq", () => ({ Queue: class { add = vi.fn() } }))
vi.mock("@/lib/billingService.js", () => h.billing)
vi.mock("@/middleware/authenticate.js", () => ({
    authenticate: (req: { user?: unknown }, _res: unknown, next: () => void) => {
        req.user = { id: "user_1", email: "user@example.com", plan: "FREE" }
        next()
    },
}))
vi.mock("@useframe/db", () => ({
    prisma: { creditBalance: { findUnique: async () => ({ balance: 5 }) } },
}))

const { default: billingRoutes } = await import("./billing.routes.js")
const { default: creditsRoutes } = await import("../credits/credits.routes.js")
const { CreditsService } = await import("../credits/credits.service.js")
const { errorHandler } = await import("@/middleware/errorHandler.js")

let server: Server
let base = ""

beforeAll(() => {
    const app = express()
    app.use(express.json())
    app.use("/api/billing", billingRoutes)
    app.use("/api/credits", creditsRoutes)
    app.use(errorHandler)
    server = createServer(app).listen(0)
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})

afterAll(() => server.close())

beforeEach(() => {
    h.env.AUTO_RELOAD_ENABLED = false
    vi.clearAllMocks()
})

const settings = { enabled: true, thresholdCents: 1000, topUpToCents: 2500 }
const json = (method: string, body?: unknown) => ({
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
})

function deductTx() {
    return {
        creditBalance: {
            updateMany: async () => ({ count: 1 }),
            findUniqueOrThrow: async () => ({ balance: 3 }),
        },
        creditTransaction: { create: async () => ({}) },
        autoReloadSetting: { findUnique: vi.fn(async () => h.setting) },
    }
}

describe("auto-reload flag", () => {
    it("hides every auto-reload and saved-card route while off", async () => {
        const responses = await Promise.all([
            fetch(`${base}/billing/auto-reload`),
            fetch(`${base}/billing/auto-reload`, json("PUT", settings)),
            fetch(`${base}/billing/payment-method`, json("POST")),
        ])
        for (const res of responses) {
            expect(res.status).toBe(404)
            expect(await res.json()).toEqual({ success: false, message: "Route not found" })
        }
        expect(h.billing.callGetAutoReload).not.toHaveBeenCalled()
        expect(h.billing.callPutAutoReload).not.toHaveBeenCalled()
        expect(h.billing.callCreateSetupIntent).not.toHaveBeenCalled()
    })

    it("returns no auto-reload settings in the credits summary while off", async () => {
        const res = await fetch(`${base}/credits`)
        expect(await res.json()).toEqual({ success: true, data: { balance: 5, autoReload: null } })
        expect(h.billing.callGetAutoReload).not.toHaveBeenCalled()
    })

    it("never schedules a top-up while off, even for a user who enabled it before", async () => {
        const tx = deductTx()
        const result = await CreditsService.deduct(tx as never, "user_1", 2, "test")
        expect(result).toEqual({ balanceAfter: 3, autoReloadTopUpCents: null })
        expect(tx.autoReloadSetting.findUnique).not.toHaveBeenCalled()
    })

    it("keeps the existing behaviour when on", async () => {
        h.env.AUTO_RELOAD_ENABLED = true
        expect((await fetch(`${base}/billing/auto-reload`)).status).toBe(200)
        const summary = await (await fetch(`${base}/credits`)).json()
        expect(summary.data.autoReload).toEqual(settings)
        const result = await CreditsService.deduct(deductTx() as never, "user_1", 2, "test")
        expect(result.autoReloadTopUpCents).toBe(2500)
    })
})
