import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { BillingController } from "./billing.controller.js"
import { CheckoutSchema, AutoReloadSchema } from "./billing.schema.js"

const router: Router = Router()

router.use(authenticate)

router.post("/checkout", validate(CheckoutSchema), BillingController.createCheckout)
router.post("/payment-method", BillingController.createSetupIntent)
router.get("/auto-reload", BillingController.getAutoReload)
router.put("/auto-reload", validate(AutoReloadSchema), BillingController.putAutoReload)

export default router
