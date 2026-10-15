import { prisma, type Prisma } from "@useframe/db"

// Credits never expire in this model — periodStart/periodEnd are vestigial
// columns from an earlier cycle-reset design. A far-future sentinel keeps
// the required periodEnd column satisfied without implying any expiry.
const NO_EXPIRY = new Date("2099-01-01T00:00:00Z")

export type RazorpayPaymentLike = {
  id: string
  order_id?: string | null
  amount?: number | string | null
  currency?: string | null
  notes?: Record<string, string>
}

export type CaptureDb = Pick<typeof prisma, "payment" | "$transaction">

export type CaptureOutcome = "granted" | "already_granted" | "flagged" | "skipped"

export async function handlePaymentCaptured(payment_: RazorpayPaymentLike, db: CaptureDb = prisma): Promise<CaptureOutcome> {
  // Keyed on the order id we created at checkout, not the payment id.
  const orderId = payment_.order_id
  if (!orderId) {
    console.warn(`[webhook] payment.captured ${payment_.id} has no order_id, skipping`)
    return "skipped"
  }

  const payment = await db.payment.findUnique({
    where: { providerOrderId: orderId },
    select: { id: true, userId: true, status: true, amount: true, currency: true, creditsGranted: true },
  })
  if (!payment) {
    console.warn(`[webhook] No Payment row for Razorpay order ${orderId}, skipping`)
    return "skipped"
  }
  if (payment.status === "SUCCESS") {
    return "already_granted"
  }
  if (payment.status === "FLAGGED") {
    return "flagged"
  }

  // The provider must report exactly what this payment was created for.
  const reportedAmount = Number(payment_.amount)
  const reportedCurrency = String(payment_.currency ?? "").toUpperCase()
  if (reportedAmount !== payment.amount || reportedCurrency !== payment.currency.toUpperCase()) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "FLAGGED", providerPaymentId: payment_.id },
    })
    console.error(
      `[webhook] Payment ${payment.id} flagged: provider reported ${reportedAmount} ${reportedCurrency}, ` +
        `expected ${payment.amount} ${payment.currency}. No credits granted.`,
    )
    return "flagged"
  }

  // Rows created before the checkout snapshot existed carry their credits only on the order notes.
  const credits = payment.creditsGranted ?? Number(payment_.notes?.credits ?? 0)
  if (!credits || credits <= 0) {
    console.warn(`[webhook] payment.captured ${payment_.id} has no credits to grant, skipping`)
    return "skipped"
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCESS", providerPaymentId: payment_.id, capturedAt: new Date() },
    })

    const existingBalance = await tx.creditBalance.findUnique({ where: { userId: payment.userId } })

    const updatedBalance = existingBalance
      ? await tx.creditBalance.update({
          where: { userId: payment.userId },
          data: { balance: { increment: credits } },
        })
      : await tx.creditBalance.create({
          data: { userId: payment.userId, balance: credits, periodEnd: NO_EXPIRY },
        })

    await tx.creditTransaction.create({
      data: {
        userId: payment.userId,
        delta: credits,
        type: "PURCHASED",
        reason: "topup",
        balanceAfter: updatedBalance.balance,
        paymentId: payment.id,
      },
    })
  })

  console.log(`[webhook] Granted ${credits} credits to user ${payment.userId} (payment ${payment.id})`)
  return "granted"
}
