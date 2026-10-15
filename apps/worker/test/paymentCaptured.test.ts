import { beforeEach, describe, expect, it, vi } from "vitest"
import { handlePaymentCaptured, type CaptureDb, type RazorpayPaymentLike } from "../src/lib/paymentCaptured.js"

type Row = Record<string, unknown>

function fakeDb() {
  const payments: Row[] = []
  const balances: Row[] = []
  const ledger: Row[] = []
  const apply = (row: Row, data: Row) => {
    for (const [k, v] of Object.entries(data)) {
      row[k] = v && typeof v === "object" && "increment" in v ? (row[k] as number) + (v as { increment: number }).increment : v
    }
    return row
  }
  const db = {
    payment: {
      findUnique: async ({ where }: { where: { providerOrderId: string } }) => {
        const row = payments.find((p) => p.providerOrderId === where.providerOrderId)
        return row ? { ...row } : null
      },
      update: async ({ where, data }: { where: { id: string }; data: Row }) => apply(payments.find((p) => p.id === where.id)!, data),
    },
    creditBalance: {
      findUnique: async ({ where }: { where: { userId: string } }) => balances.find((b) => b.userId === where.userId) ?? null,
      update: async ({ where, data }: { where: { userId: string }; data: Row }) => apply(balances.find((b) => b.userId === where.userId)!, data),
      create: async ({ data }: { data: Row }) => {
        balances.push({ ...data })
        return data
      },
    },
    creditTransaction: {
      create: async ({ data }: { data: Row }) => {
        ledger.push(data)
        return data
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  }
  return { db: db as unknown as CaptureDb, payments, balances, ledger }
}

let store: ReturnType<typeof fakeDb>

const captured = (overrides: Partial<RazorpayPaymentLike> = {}): RazorpayPaymentLike => ({
  id: "pay_rzp_1",
  order_id: "order_1",
  amount: 4900,
  currency: "USD",
  notes: { userId: "user_1", credits: "999" },
  ...overrides,
})

beforeEach(() => {
  store = fakeDb()
  store.payments.push({
    id: "payment_1",
    userId: "user_1",
    providerOrderId: "order_1",
    status: "PENDING",
    amount: 4900,
    currency: "USD",
    creditsGranted: 98,
  })
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

describe("handlePaymentCaptured", () => {
  it("grants the snapshot's credits, not the order notes", async () => {
    expect(await handlePaymentCaptured(captured(), store.db)).toBe("granted")
    expect(store.balances[0]).toMatchObject({ userId: "user_1", balance: 98 })
    expect(store.ledger).toEqual([expect.objectContaining({ delta: 98, type: "PURCHASED", paymentId: "payment_1" })])
    expect(store.payments[0]).toMatchObject({ status: "SUCCESS", providerPaymentId: "pay_rzp_1" })
  })

  it.each([
    ["a wrong amount", { amount: 100 }],
    ["a wrong currency", { currency: "INR" }],
    ["a missing amount", { amount: undefined }],
  ])("flags the payment and grants nothing on %s", async (_label, overrides) => {
    expect(await handlePaymentCaptured(captured(overrides), store.db)).toBe("flagged")
    expect(store.payments[0]!.status).toBe("FLAGGED")
    expect(store.balances).toHaveLength(0)
    expect(store.ledger).toHaveLength(0)
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("flagged"))

    // A later, correct-looking event still grants nothing for a flagged payment.
    expect(await handlePaymentCaptured(captured(), store.db)).toBe("flagged")
    expect(store.ledger).toHaveLength(0)
  })

  it("grants credits once when the webhook is replayed", async () => {
    expect(await handlePaymentCaptured(captured(), store.db)).toBe("granted")
    expect(await handlePaymentCaptured(captured(), store.db)).toBe("already_granted")
    expect(store.ledger).toHaveLength(1)
    expect(store.balances[0]!.balance).toBe(98)
  })

  it("accepts a lowercase currency from the provider", async () => {
    expect(await handlePaymentCaptured(captured({ currency: "usd" }), store.db)).toBe("granted")
  })

  it("falls back to the order notes only for rows created before the snapshot existed", async () => {
    store.payments[0]!.creditsGranted = null
    expect(await handlePaymentCaptured(captured({ notes: { credits: "65" } }), store.db)).toBe("granted")
    expect(store.balances[0]!.balance).toBe(65)
  })
})
