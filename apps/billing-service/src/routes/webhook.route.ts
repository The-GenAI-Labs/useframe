import crypto from "node:crypto"
import { Router, type Request, type Response } from "express"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { WebhookJobPayload } from "@repo/events"
import { prisma } from "@useframe/db"
import { env } from "@/config/env.js"
import { redis } from "@/lib/redis.js"

const router: Router = Router()

const webhookQueue = new Queue<WebhookJobPayload>(QUEUES.WEBHOOK, { connection: redis })

type RazorpayWebhookBody = {
  event: string
  payload?: {
    payment?: { entity?: Record<string, unknown> }
    order?: { entity?: Record<string, unknown> }
    token?: { entity?: Record<string, unknown> }
  }
}

// Constant-time compare so a mismatch can't leak the expected digest.
function isValidSignature(rawBody: Buffer, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex")

  const provided = Buffer.from(signature, "utf8")
  const expectedBuf = Buffer.from(expected, "utf8")
  if (provided.length !== expectedBuf.length) return false
  return crypto.timingSafeEqual(provided, expectedBuf)
}

// Razorpay sends no event id, so derive a stable one from the signature:
// retries hash identically and dedupe via the eventId unique constraint.
function deriveEventId(signature: string): string {
  return crypto.createHash("sha256").update(signature).digest("hex")
}

router.post("/webhooks/razorpay", (req: Request, res: Response) => {
  const signature = req.headers["x-razorpay-signature"]
  if (!signature || typeof signature !== "string") {
    res.status(400).send("Missing X-Razorpay-Signature header")
    return
  }

  const rawBody = req.body as Buffer
  if (!isValidSignature(rawBody, signature)) {
    console.error("Razorpay webhook signature verification failed")
    res.status(400).send("Invalid signature")
    return
  }

  let body: RazorpayWebhookBody
  try {
    body = JSON.parse(rawBody.toString("utf8")) as RazorpayWebhookBody
  } catch {
    res.status(400).send("Invalid JSON body")
    return
  }

  const entity =
    body.payload?.payment?.entity ??
    body.payload?.token?.entity ??
    body.payload?.order?.entity ??
    {}

  prisma.webhookEvent
    .create({
      data: {
        eventId: deriveEventId(signature),
        eventType: body.event,
        provider: "razorpay",
        payload: entity as object,
      },
    })
    .then((webhookEvent: { id: string }) => {
      const payload: WebhookJobPayload = {
        webhookEventId: webhookEvent.id,
        provider: "razorpay",
        eventType: body.event,
        payload: entity as Record<string, unknown>,
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
      // Already-recorded retry — idempotent no-op, not an error.
      if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
        res.status(200).json({ received: true, duplicate: true })
        return
      }
      console.error("Failed to process Razorpay webhook:", err)
      res.status(500).json({ received: false })
    })
})

export default router
