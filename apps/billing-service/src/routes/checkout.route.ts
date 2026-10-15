import { Router, type Request, type Response } from "express"
import { prisma } from "@useframe/db"
import { CheckoutRequestSchema } from "@repo/schemas"
import { env } from "@/config/env.js"
import { razorpay } from "@/lib/razorpay.js"
import { getOrCreateRazorpayCustomer } from "@/lib/customer.js"
import { CheckoutError, createCheckout } from "@/lib/checkout.js"

const router: Router = Router()

// The body names a plan (or a custom top-up amount); the price always comes from the server.
router.post("/checkout/create-order", (req: Request, res: Response, next) => {
  const userId = req.headers["x-user-id"] as string | undefined
  const userEmail = req.headers["x-user-email"] as string | undefined
  if (!userId || !userEmail) {
    res.status(401).json({ success: false, message: "Missing user identity" })
    return
  }

  const parsed = CheckoutRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    })
    return
  }

  createCheckout(
    {
      db: prisma,
      createOrder: async ({ amountMinor, currency, notes }) => {
        const customerId = await getOrCreateRazorpayCustomer(userId, userEmail)
        return razorpay.orders.create({ amount: amountMinor, currency, customer_id: customerId, notes })
      },
    },
    userId,
    parsed.data,
  )
    .then((result) => {
      res.status(201).json({ success: true, data: { ...result, keyId: env.RAZORPAY_KEY_ID } })
    })
    .catch((err: unknown) => {
      if (err instanceof CheckoutError) {
        res.status(err.status).json({ success: false, error: err.code, code: err.code, message: err.message })
        return
      }
      next(err)
    })
})

export default router
