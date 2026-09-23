import { Worker } from "bullmq"
import type { Job } from "bullmq"
import { prisma, type Prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { WebhookJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"

// Credits never expire in this model — periodStart/periodEnd are vestigial
// columns from an earlier cycle-reset design. A far-future sentinel keeps
// the required periodEnd column satisfied without implying any expiry.
const NO_EXPIRY = new Date("2099-01-01T00:00:00Z")

type RazorpayPaymentLike = {
  id: string
  order_id?: string | null
  notes?: Record<string, string>
}

type RazorpayTokenLike = {
  id: string
  customer_id?: string | null
}

async function handlePaymentCaptured(payment_: RazorpayPaymentLike): Promise<void> {
  // Credits live on the order's notes, which Razorpay copies onto the payment.
  const credits = Number(payment_.notes?.credits ?? 0)
  if (!credits || credits <= 0) {
    console.warn(`[webhook] payment.captured ${payment_.id} has no credits note, skipping`)
    return
  }

  // Keyed on the order id we created at checkout, not the payment id.
  const orderId = payment_.order_id
  if (!orderId) {
    console.warn(`[webhook] payment.captured ${payment_.id} has no order_id, skipping`)
    return
  }

  const payment = await prisma.payment.findUnique({
    where: { providerOrderId: orderId },
    select: { id: true, userId: true, status: true },
  })
  if (!payment) {
    console.warn(`[webhook] No Payment row for Razorpay order ${orderId}, skipping`)
    return
  }
  if (payment.status === "SUCCESS") {
    return
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
}

async function handleTokenConfirmed(token: RazorpayTokenLike): Promise<void> {
  const tokenId = token.id
  const customerId = token.customer_id

  if (!tokenId || !customerId) {
    console.warn("[webhook] token.confirmed missing token id or customer_id, skipping")
    return
  }

  const user = await prisma.user.findUnique({
    where: { razorpayCustomerId: customerId },
    select: { id: true },
  })
  if (!user) {
    console.warn(`[webhook] No user for Razorpay customer ${customerId}, skipping`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { defaultPaymentMethodId: tokenId },
  })

  console.log(`[webhook] Saved default payment token for user ${user.id}`)
}

async function processWebhook(job: Job<WebhookJobPayload>): Promise<void> {
  const { webhookEventId, eventType, payload } = job.data

  try {
    if (eventType === "payment.captured") {
      await handlePaymentCaptured(payload as unknown as RazorpayPaymentLike)
    } else if (eventType === "token.confirmed") {
      await handleTokenConfirmed(payload as unknown as RazorpayTokenLike)
    }

    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processed: true, processedAt: new Date() },
    })
  } catch (err) {
    console.error(`[webhook] Failed webhookEventId=${webhookEventId} eventType=${eventType}:`, err)
    throw err
  }
}

export function startWebhookWorker(): Worker<WebhookJobPayload> {
  const worker = new Worker<WebhookJobPayload>(QUEUES.WEBHOOK, processWebhook, {
    connection: redis,
    concurrency: 5,
  })

  worker.on("completed", (job) => {
    console.log(`[webhook] Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(`[webhook] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
