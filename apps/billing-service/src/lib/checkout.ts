import type { prisma } from "@useframe/db"
import {
  CUSTOM_MAX_AMOUNT_CENTS,
  CUSTOM_MIN_AMOUNT_CENTS,
  creditsForCustomAmount,
  type CheckoutRequest,
} from "@repo/schemas"

// Requires International Payments enabled on the Razorpay account.
export const CUSTOM_TOPUP_CURRENCY = "USD"

export class CheckoutError extends Error {
  constructor(
    public readonly status: 400 | 422,
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "CheckoutError"
  }
}

export type CheckoutDb = Pick<typeof prisma, "plan" | "payment">

export type CreateProviderOrder = (input: {
  amountMinor: number
  currency: string
  notes: Record<string, string>
}) => Promise<{ id: string }>

export type CheckoutResult = {
  orderId: string
  amountCents: number
  currency: string
  credits: number
  planSlug: string | null
}

type Sale = {
  amountMinor: number
  currency: string
  credits: number
  plan: { id: string; slug: string; name: string } | null
}

async function planSale(db: CheckoutDb, slug: string): Promise<Sale> {
  const plan = await db.plan.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, priceMinor: true, currency: true, credits: true, isActive: true },
  })
  if (!plan || !plan.isActive || plan.priceMinor <= 0 || plan.credits <= 0) {
    throw new CheckoutError(400, "PLAN_UNAVAILABLE", "That plan isn't available.")
  }
  return {
    amountMinor: plan.priceMinor,
    currency: plan.currency.toUpperCase(),
    credits: plan.credits,
    plan: { id: plan.id, slug: plan.slug, name: plan.name },
  }
}

function customSale(amountCents: number): Sale {
  if (!Number.isInteger(amountCents) || amountCents < CUSTOM_MIN_AMOUNT_CENTS) {
    throw new CheckoutError(400, "BELOW_MINIMUM", `Minimum top-up is $${CUSTOM_MIN_AMOUNT_CENTS / 100}.`)
  }
  if (amountCents > CUSTOM_MAX_AMOUNT_CENTS) {
    throw new CheckoutError(400, "ABOVE_MAXIMUM", `Maximum top-up is $${CUSTOM_MAX_AMOUNT_CENTS / 100}.`)
  }
  return { amountMinor: amountCents, currency: CUSTOM_TOPUP_CURRENCY, credits: creditsForCustomAmount(amountCents), plan: null }
}

// Prices every purchase on the server: a plan from its database row, a custom
// top-up from the custom rate. The payment row keeps a snapshot of the sale.
export async function createCheckout(
  deps: { db: CheckoutDb; createOrder: CreateProviderOrder },
  userId: string,
  input: CheckoutRequest,
): Promise<CheckoutResult> {
  let sale: Sale
  if (input.planSlug !== undefined) sale = await planSale(deps.db, input.planSlug)
  else if (input.amountCents !== undefined) sale = customSale(input.amountCents)
  else throw new CheckoutError(400, "MISSING_PLAN", "Choose a plan or enter a top-up amount.")

  const order = await deps.createOrder({
    amountMinor: sale.amountMinor,
    currency: sale.currency,
    notes: { userId, credits: String(sale.credits), ...(sale.plan ? { planSlug: sale.plan.slug } : {}) },
  })

  await deps.db.payment.create({
    data: {
      userId,
      purpose: "CREDIT_TOPUP",
      amount: sale.amountMinor,
      currency: sale.currency,
      status: "PENDING",
      provider: "razorpay",
      providerOrderId: order.id,
      creditsGranted: sale.credits,
      ...(sale.plan ? { planId: sale.plan.id, planSlug: sale.plan.slug, planName: sale.plan.name } : {}),
    },
  })

  return {
    orderId: order.id,
    amountCents: sale.amountMinor,
    currency: sale.currency,
    credits: sale.credits,
    planSlug: sale.plan?.slug ?? null,
  }
}
