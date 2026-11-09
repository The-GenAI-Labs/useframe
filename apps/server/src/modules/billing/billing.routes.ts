import { Router } from "express"
import type { NextFunction, Request, Response } from "express"
import { env } from "@/config/env.js"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { BillingController } from "./billing.controller.js"
import { CheckoutSchema, AutoReloadSchema } from "./billing.schema.js"

const router: Router = Router()

function autoReloadEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (env.AUTO_RELOAD_ENABLED) return next()
  res.status(404).json({ success: false, message: "Route not found" })
}

router.use(authenticate)

router.post("/checkout", validate(CheckoutSchema), BillingController.createCheckout)
// A saved card exists only to be charged by auto-reload.
router.post("/payment-method", autoReloadEnabled, BillingController.createSetupIntent)
router.get("/auto-reload", autoReloadEnabled, BillingController.getAutoReload)
router.put("/auto-reload", autoReloadEnabled, validate(AutoReloadSchema), BillingController.putAutoReload)

export default router
