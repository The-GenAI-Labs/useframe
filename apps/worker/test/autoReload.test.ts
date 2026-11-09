import type { Job } from "bullmq"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AutoReloadJobPayload } from "@repo/events"

const h = vi.hoisted(() => ({
  env: { AUTO_RELOAD_ENABLED: false },
  findUser: vi.fn(async () => ({ razorpayCustomerId: "cust_1", defaultPaymentMethodId: "token_1" })),
  createOrder: vi.fn(async () => ({ id: "order_1" })),
  charge: vi.fn(async () => ({ razorpay_payment_id: "pay_1" })),
  createPayment: vi.fn(async () => ({})),
}))

vi.mock("../src/config/env.js", () => ({ env: h.env }))
vi.mock("../src/lib/redis.js", () => ({ redis: {} }))
vi.mock("bullmq", () => ({ Queue: class { add = vi.fn() }, Worker: class {} }))
vi.mock("../src/lib/razorpay.js", () => ({
  razorpay: { orders: { create: h.createOrder }, payments: { createRecurringPayment: h.charge } },
}))
vi.mock("@useframe/db", () => ({
  prisma: {
    user: { findUniqueOrThrow: h.findUser },
    identity: { findFirst: async () => ({ email: "user@example.com" }) },
    payment: { create: h.createPayment },
    autoReloadSetting: { update: vi.fn() },
  },
}))

const { processAutoReload } = await import("../src/processors/autoReload.processor.js")

const job = { id: "1", data: { userId: "user_1", topUpToCents: 2500 } } as Job<AutoReloadJobPayload>

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("auto-reload worker", () => {
  it("drops queued jobs without charging while the flag is off", async () => {
    h.env.AUTO_RELOAD_ENABLED = false
    await processAutoReload(job)
    expect(h.findUser).not.toHaveBeenCalled()
    expect(h.createOrder).not.toHaveBeenCalled()
    expect(h.charge).not.toHaveBeenCalled()
    expect(h.createPayment).not.toHaveBeenCalled()
  })

  it("charges the saved card when the flag is on", async () => {
    h.env.AUTO_RELOAD_ENABLED = true
    await processAutoReload(job)
    expect(h.charge).toHaveBeenCalledOnce()
    expect(h.createPayment).toHaveBeenCalledOnce()
  })
})
