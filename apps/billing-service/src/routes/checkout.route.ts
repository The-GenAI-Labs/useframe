import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { prisma } from "@useframe/db"
import { stripe } from "@/lib/stripe.js"
import { getOrCreateStripeCustomer } from "@/lib/customer.js"
import { creditsForAmount } from "@/lib/pricing.js"

const router: Router = Router()

const CreateCheckoutSchema = z.object({
  amountCents: z.number().int().min(500, "Minimum top-up is $5"),
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

  const { amountCents } = parsed.data
  const credits = creditsForAmount(amountCents)

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
