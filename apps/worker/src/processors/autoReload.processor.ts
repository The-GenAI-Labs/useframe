import { Worker, Queue } from "bullmq"
import type { Job } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { AutoReloadJobPayload, EmailJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"
import { stripe } from "../lib/stripe.js"
// Auto-reload is a custom-amount top-up (the user sets topUpToCents), so it
// prices at the custom rate — the same rate a manual custom top-up gets.
// Using the old lib/pricing.ts curve here would quietly grant ~2x the
// credits of an equivalent manual purchase.
import { creditsForCustomAmount } from "@repo/schemas"

const emailQueue = new Queue<EmailJobPayload>(QUEUES.EMAIL, { connection: redis })

async function processAutoReload(job: Job<AutoReloadJobPayload>): Promise<void> {
  const { userId, topUpToCents } = job.data

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { stripeCustomerId: true, defaultPaymentMethodId: true },
  })

  const identity = await prisma.identity.findFirst({
    where: { userId, isPrimary: true },
    select: { email: true },
  })

  if (!user.stripeCustomerId || !user.defaultPaymentMethodId) {
    console.warn(`[autoReload] User ${userId} has no saved card, disabling auto-reload`)
    await prisma.autoReloadSetting.update({ where: { userId }, data: { enabled: false } })
    return
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: topUpToCents,
      currency: "usd",
      customer: user.stripeCustomerId,
      payment_method: user.defaultPaymentMethodId,
      off_session: true,
      confirm: true,
      metadata: { userId, credits: String(creditsForCustomAmount(topUpToCents)) },
    })

    await prisma.payment.create({
      data: {
        userId,
        purpose: "CREDIT_TOPUP",
        amount: topUpToCents,
        currency: "USD",
        status: "PENDING",
        provider: "stripe",
        providerOrderId: paymentIntent.id,
      },
    })

    console.log(`[autoReload] Charged user ${userId} for ${topUpToCents} cents (PaymentIntent ${paymentIntent.id})`)
  } catch (err) {
    console.error(`[autoReload] Off-session charge failed for user ${userId}:`, err)

    await prisma.autoReloadSetting.update({ where: { userId }, data: { enabled: false } })

    if (identity?.email) {
      await emailQueue.add("email", {
        to: identity.email,
        template: "auto_reload_failed",
        data: { userId },
      })
    }

    throw err
  }
}

export function startAutoReloadWorker(): Worker<AutoReloadJobPayload> {
  const worker = new Worker<AutoReloadJobPayload>(QUEUES.AUTO_RELOAD, processAutoReload, {
    connection: redis,
    concurrency: 3,
  })

  worker.on("completed", (job) => {
    console.log(`[autoReload] Job ${job.id} completed`)
  })

  worker.on("failed", (job, err) => {
    console.error(`[autoReload] Job ${job?.id} failed:`, err.message)
  })

  return worker
}
