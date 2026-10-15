import { Worker } from "bullmq"
import type { Job } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { WebhookJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"
import { handlePaymentCaptured, type RazorpayPaymentLike } from "../lib/paymentCaptured.js"

type RazorpayTokenLike = {
  id: string
  customer_id?: string | null
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
