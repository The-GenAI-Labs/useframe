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

type StripePaymentIntentLike = {
  id: string
  metadata?: Record<string, string>
}

type StripeSetupIntentLike = {
  payment_method?: string | { id: string } | null
  customer?: string | { id: string } | null
}

async function handlePaymentIntentSucceeded(paymentIntent: StripePaymentIntentLike): Promise<void> {
  const credits = Number(paymentIntent.metadata?.credits ?? 0)
  if (!credits || credits <= 0) {
    console.warn(`[webhook] payment_intent.succeeded ${paymentIntent.id} has no credits metadata, skipping`)
    return
  }

  const payment = await prisma.payment.findUnique({
    where: { providerOrderId: paymentIntent.id },
    select: { id: true, userId: true, status: true },
  })
  if (!payment) {
    console.warn(`[webhook] No Payment row for PaymentIntent ${paymentIntent.id}, skipping`)
    return
  }
  if (payment.status === "SUCCESS") {
    // Already processed (Stripe retried the webhook) — idempotent no-op.
    return
  }

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "SUCCESS", providerPaymentId: paymentIntent.id, capturedAt: new Date() },
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

async function handleSetupIntentSucceeded(setupIntent: StripeSetupIntentLike): Promise<void> {
  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id

  const customerId =
    typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id

  if (!paymentMethodId || !customerId) {
    console.warn("[webhook] setup_intent.succeeded missing payment_method or customer, skipping")
    return
  }

  const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } })
  if (!user) {
    console.warn(`[webhook] No user for Stripe customer ${customerId}, skipping`)
    return
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { defaultPaymentMethodId: paymentMethodId },
  })

  console.log(`[webhook] Saved default payment method for user ${user.id}`)
}

async function processWebhook(job: Job<WebhookJobPayload>): Promise<void> {
  const { webhookEventId, eventType, payload } = job.data

  try {
    if (eventType === "payment_intent.succeeded") {
      await handlePaymentIntentSucceeded(payload as unknown as StripePaymentIntentLike)
    } else if (eventType === "setup_intent.succeeded") {
      await handleSetupIntentSucceeded(payload as unknown as StripeSetupIntentLike)
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
