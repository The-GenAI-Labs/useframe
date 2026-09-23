import { Router, type Request, type Response } from "express"
import { env } from "@/config/env.js"
import { razorpay } from "@/lib/razorpay.js"
import { getOrCreateRazorpayCustomer } from "@/lib/customer.js"

const router: Router = Router()

// Razorpay has no SetupIntent: a card is saved by running a real checkout
// with `save: 1`. Zero-amount orders are rejected, so this authorizes the
// smallest permitted amount purely to mint the token.
const CARD_SAVE_AUTH_AMOUNT = 100

router.post("/payment-methods/setup-intent", (req: Request, res: Response, next) => {
  const userId = req.headers["x-user-id"] as string | undefined
  const userEmail = req.headers["x-user-email"] as string | undefined
  if (!userId || !userEmail) {
    res.status(401).json({ success: false, message: "Missing user identity" })
    return
  }

  getOrCreateRazorpayCustomer(userId, userEmail)
    .then((customerId) =>
      razorpay.orders
        .create({
          amount: CARD_SAVE_AUTH_AMOUNT,
          currency: "USD",
          customer_id: customerId,
          method: "card",
          // Token arrives via the token.confirmed webhook.
          token: { max_amount: CARD_SAVE_AUTH_AMOUNT, frequency: "as_presented" },
          notes: { userId, purpose: "save_card" },
        })
        .then((order) => ({ order, customerId }))
    )
    .then(({ order, customerId }) => {
      res.status(201).json({
        success: true,
        data: {
          orderId: order.id,
          keyId: env.RAZORPAY_KEY_ID,
          customerId,
          amountCents: CARD_SAVE_AUTH_AMOUNT,
          currency: "USD",
        },
      })
    })
    .catch(next)
})

export default router
