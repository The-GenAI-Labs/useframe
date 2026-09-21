import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { prisma } from "@useframe/db"
import { stripe } from "@/lib/stripe.js"
import { getOrCreateStripeCustomer } from "@/lib/customer.js"
import {
  CUSTOM_MIN_AMOUNT_CENTS,
  creditsForCustomAmount,
  findCreditPack,
} from "@repo/schemas"

const router: Router = Router()

// Either a fixed pack (packId is the pack's amountCents) or a custom amount.
// Pack purchases ignore any amountCents sent alongside — the pack's own
// price is authoritative, so a client can't buy a pack's credits for less.
const CreateCheckoutSchema = z.object({
  packId: z.number().int().optional(),
  amountCents: z.number().int().optional(),
})

router.post("/checkout/create-order", (req: Request, res: Response, next) => {
  const userId = req.headers["x-user-id"] as string | undefined
  const userEmail = req.headers["x-user-email"] as string | undefined
  if (!userId || !userEmail) {
    res.status(401).json({ success: false, message: "Missing user identity" })
    return
  }

  const parsed = CreateCheckoutSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    })
    return
  }

  let amountCents: number
  let credits: number

  if (parsed.data.packId !== undefined) {
    const pack = findCreditPack(parsed.data.packId)
    if (!pack) {
      res.status(400).json({ success: false, error: "INVALID_PACK" })
      return
    }
    amountCents = pack.amountCents
    credits = pack.credits
  } else {
    if (parsed.data.amountCents === undefined) {
      res.status(400).json({
        success: false,
        error: "MISSING_AMOUNT",
        message: "Provide either a packId or a custom amountCents.",
      })
      return
    }
    if (parsed.data.amountCents < CUSTOM_MIN_AMOUNT_CENTS) {
      res.status(400).json({
        success: false,
        error: "BELOW_MINIMUM",
        message: "Minimum top-up is $10.",
      })
      return
    }
    amountCents = parsed.data.amountCents
    credits = creditsForCustomAmount(amountCents)
  }

  getOrCreateStripeCustomer(userId, userEmail)
    .then((customerId) =>
      stripe.paymentIntents.create({
        amount: amountCents,
        currency: "usd",
        customer: customerId,
        metadata: { userId, credits: String(credits) },
      })
    )
    .then((paymentIntent) =>
      prisma.payment
        .create({
          data: {
            userId,
            purpose: "CREDIT_TOPUP",
            amount: amountCents,
            currency: "USD",
            status: "PENDING",
            provider: "stripe",
            providerOrderId: paymentIntent.id,
          },
        })
        .then(() => {
          res.status(201).json({
            success: true,
            data: { clientSecret: paymentIntent.client_secret, credits },
          })
        })
    )
    .catch(next)
})

export default router
