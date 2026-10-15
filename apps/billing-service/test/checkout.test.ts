import { beforeEach, describe, expect, it } from "vitest"
import { CheckoutRequestSchema } from "@repo/schemas"
import { CheckoutError, createCheckout, type CheckoutDb, type CreateProviderOrder } from "@/lib/checkout.js"

type Row = Record<string, unknown>

function fakeDb() {
  const plans: Row[] = []
  const payments: Row[] = []
  const db = {
    plan: {
      findUnique: async ({ where }: { where: { slug: string } }) => plans.find((p) => p.slug === where.slug) ?? null,
      update: async ({ where, data }: { where: { slug: string }; data: Row }) =>
        Object.assign(plans.find((p) => p.slug === where.slug)!, data),
    },
    payment: {
      create: async ({ data }: { data: Row }) => {
        const row = { id: `pay_${payments.length + 1}`, ...data }
        payments.push(row)
        return row
      },
    },
  }
  return { db, plans, payments }
}

let store: ReturnType<typeof fakeDb>
let orders: Parameters<CreateProviderOrder>[0][]
const createOrder: CreateProviderOrder = async (input) => {
  orders.push(input)
  return { id: `order_${orders.length}` }
}
const deps = () => ({ db: store.db as unknown as CheckoutDb, createOrder })
// The route parses the body with the shared schema; tests go through it too.
const body = (raw: unknown) => CheckoutRequestSchema.parse(raw)

beforeEach(() => {
  store = fakeDb()
  orders = []
  store.plans.push(
    { id: "plan_starter", slug: "starter", name: "Starter", priceMinor: 4900, currency: "USD", credits: 98, isActive: true },
    { id: "plan_old", slug: "legacy", name: "Legacy", priceMinor: 2900, currency: "USD", credits: 58, isActive: false },
  )
})

describe("createCheckout", () => {
  it("ignores any client-sent amount, price, currency or credits for a plan", async () => {
    const result = await createCheckout(
      deps(),
      "user_1",
      body({ planSlug: "starter", amountCents: 1, price: 1, currency: "INR", credits: 999999 }),
    )
    expect(orders).toEqual([{ amountMinor: 4900, currency: "USD", notes: { userId: "user_1", credits: "98", planSlug: "starter" } }])
    expect(result).toMatchObject({ amountCents: 4900, currency: "USD", credits: 98, planSlug: "starter" })
    expect(store.payments[0]).toMatchObject({
      amount: 4900,
      currency: "USD",
      creditsGranted: 98,
      planId: "plan_starter",
      planSlug: "starter",
      planName: "Starter",
      providerOrderId: "order_1",
      status: "PENDING",
    })
  })

  it("rejects an unknown or inactive plan with PLAN_UNAVAILABLE and creates nothing", async () => {
    for (const planSlug of ["nope", "legacy"]) {
      await expect(createCheckout(deps(), "user_1", body({ planSlug }))).rejects.toMatchObject({ status: 400, code: "PLAN_UNAVAILABLE" })
    }
    expect(orders).toHaveLength(0)
    expect(store.payments).toHaveLength(0)
  })

  it("rejects a malformed plan slug at the schema", () => {
    expect(CheckoutRequestSchema.safeParse({ planSlug: "Starter; DROP" }).success).toBe(false)
  })

  it("uses the new price after a price change while old payments keep their snapshot", async () => {
    await createCheckout(deps(), "user_1", body({ planSlug: "starter" }))
    await store.db.plan.update({ where: { slug: "starter" }, data: { priceMinor: 5900, credits: 118, name: "Starter Plus" } })
    await createCheckout(deps(), "user_1", body({ planSlug: "starter" }))

    expect(orders.map((o) => o.amountMinor)).toEqual([4900, 5900])
    expect(store.payments[0]).toMatchObject({ amount: 4900, creditsGranted: 98, planName: "Starter" })
    expect(store.payments[1]).toMatchObject({ amount: 5900, creditsGranted: 118, planName: "Starter Plus" })
  })

  it("prices a custom top-up on the server and enforces its bounds", async () => {
    const result = await createCheckout(deps(), "user_1", body({ amountCents: 2500, credits: 5000 }))
    expect(result).toMatchObject({ amountCents: 2500, credits: 12, planSlug: null })
    expect(store.payments[0]).toMatchObject({ amount: 2500, creditsGranted: 12 })
    expect(store.payments[0]!.planId).toBeUndefined()

    await expect(createCheckout(deps(), "user_1", body({ amountCents: 999 }))).rejects.toMatchObject({ code: "BELOW_MINIMUM" })
    await expect(createCheckout(deps(), "user_1", body({ amountCents: 100_001 }))).rejects.toMatchObject({ code: "ABOVE_MAXIMUM" })
    expect(CheckoutRequestSchema.safeParse({ amountCents: 25.5 }).success).toBe(false)
  })

  it("requires a plan or an amount", async () => {
    await expect(createCheckout(deps(), "user_1", body({}))).rejects.toBeInstanceOf(CheckoutError)
  })
})
