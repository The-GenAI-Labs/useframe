import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { prisma } from "@useframe/db"
import { env } from "@/config/env.js"
import { razorpay } from "@/lib/razorpay.js"
import { getOrCreateRazorpayCustomer } from "@/lib/customer.js"
import {
  CUSTOM_MIN_AMOUNT_CENTS,
  creditsForCustomAmount,
  findCreditPack,
} from "@repo/schemas"

const router: Router = Router()

// Must stay aligned with the dollar-priced packs in @repo/schemas.
// Requires International Payments enabled on the Razorpay account.
export const CHECKOUT_CURRENCY = "USD"

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

  getOrCreateRazorpayCustomer(userId, userEmail)
    .then((customerId) =>
      razorpay.orders.create({
        amount: amountCents,
        currency: CHECKOUT_CURRENCY,
        customer_id: customerId,
        notes: { userId, credits: String(credits) },
      })
    )
    .then((order) =>
      prisma.payment
        .create({
          data: {
            userId,
            purpose: "CREDIT_TOPUP",
            amount: amountCents,
            currency: CHECKOUT_CURRENCY,
            status: "PENDING",
            provider: "razorpay",
            providerOrderId: order.id,
          },
        })
        .then(() => {
          res.status(201).json({
            success: true,
            data: {
              orderId: order.id,
              keyId: env.RAZORPAY_KEY_ID,
              amountCents,
              currency: CHECKOUT_CURRENCY,
              credits,
            },
          })
        })
    )
    .catch(next)
})

export default router
