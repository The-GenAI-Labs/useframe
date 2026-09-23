import { Worker, Queue } from "bullmq"
import type { Job } from "bullmq"
import { prisma } from "@useframe/db"
import { QUEUES } from "@repo/events"
import type { AutoReloadJobPayload, EmailJobPayload } from "@repo/events"
import { redis } from "../lib/redis.js"
import { razorpay } from "../lib/razorpay.js"
// Auto-reload is a custom-amount top-up, so it prices at the custom rate.
import { creditsForCustomAmount } from "@repo/schemas"

const emailQueue = new Queue<EmailJobPayload>(QUEUES.EMAIL, { connection: redis })

async function processAutoReload(job: Job<AutoReloadJobPayload>): Promise<void> {
  const { userId, topUpToCents } = job.data

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { razorpayCustomerId: true, defaultPaymentMethodId: true },
  })

  const identity = await prisma.identity.findFirst({
    where: { userId, isPrimary: true },
    select: { email: true },
  })

  if (!user.razorpayCustomerId || !user.defaultPaymentMethodId) {
    console.warn(`[autoReload] User ${userId} has no saved card, disabling auto-reload`)
    await prisma.autoReloadSetting.update({ where: { userId }, data: { enabled: false } })
    return
  }

  try {
    const credits = creditsForCustomAmount(topUpToCents)

    // The credits note must be on the order — payment.captured reads it back.
    const order = await razorpay.orders.create({
      amount: topUpToCents,
      currency: "USD",
      customer_id: user.razorpayCustomerId,
      notes: { userId, credits: String(credits) },
    })

    const payment = await razorpay.payments.createRecurringPayment({
      email: identity?.email ?? "",
      contact: "",
      amount: topUpToCents,
      currency: "USD",
      order_id: order.id,
      customer_id: user.razorpayCustomerId,
      token: user.defaultPaymentMethodId,
      recurring: "1",
      notes: { userId, credits: String(credits) },
    })

    await prisma.payment.create({
      data: {
        userId,
        purpose: "CREDIT_TOPUP",
        amount: topUpToCents,
        currency: "USD",
        status: "PENDING",
        provider: "razorpay",
        providerOrderId: order.id,
      },
    })

    console.log(
      `[autoReload] Charged user ${userId} for ${topUpToCents} cents ` +
        `(order ${order.id}, payment ${(payment as { razorpay_payment_id?: string }).razorpay_payment_id ?? "pending"})`,
    )
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
