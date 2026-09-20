import { Router, type Request, type Response } from "express"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { WebhookJobPayload } from "@repo/events"
import { prisma } from "@useframe/db"
import { env } from "@/config/env.js"
import { stripe } from "@/lib/stripe.js"
import { redis } from "@/lib/redis.js"

const router: Router = Router()

const webhookQueue = new Queue<WebhookJobPayload>(QUEUES.WEBHOOK, { connection: redis })

router.post("/webhooks/stripe", (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"]
  if (!signature || typeof signature !== "string") {
    res.status(400).send("Missing Stripe-Signature header")
    return
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err)
    res.status(400).send("Invalid signature")
    return
  }

  prisma.webhookEvent
    .create({
      data: {
        eventId: event.id,
        eventType: event.type,
        provider: "stripe",
        payload: event.data.object as object,
      },
    })
    .then((webhookEvent: { id: string }) => {
      const payload: WebhookJobPayload = {
        webhookEventId: webhookEvent.id,
        provider: "stripe",
        eventType: event.type,
        payload: event.data.object as unknown as Record<string, unknown>,
      }
      return webhookQueue.add("webhook", payload, {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      })
    })
    .then(() => {
      res.status(200).json({ received: true })
    })
    .catch((err: unknown) => {
      // Unique-constraint violation on eventId means Stripe retried a webhook
      // we've already recorded — treat as an idempotent no-op, not an error.
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        res.status(200).json({ received: true, duplicate: true })
        return
      }
      console.error("Failed to process Stripe webhook:", err)
      res.status(500).json({ received: false })
    })
})

export default router
