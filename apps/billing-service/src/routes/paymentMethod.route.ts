import { Router, type Request, type Response } from "express"
import { stripe } from "@/lib/stripe.js"
import { getOrCreateStripeCustomer } from "@/lib/customer.js"

const router: Router = Router()

router.post("/payment-methods/setup-intent", (req: Request, res: Response, next) => {
  const userId = req.headers["x-user-id"] as string | undefined
  const userEmail = req.headers["x-user-email"] as string | undefined
  if (!userId || !userEmail) {
    res.status(401).json({ success: false, message: "Missing user identity" })
    return
  }

  getOrCreateStripeCustomer(userId, userEmail)
    .then((customerId) =>
      stripe.setupIntents.create({
        customer: customerId,
        usage: "off_session",
      })
    )
    .then((setupIntent) => {
      res.status(201).json({ success: true, data: { clientSecret: setupIntent.client_secret } })
    })
    .catch(next)
})

export default router
