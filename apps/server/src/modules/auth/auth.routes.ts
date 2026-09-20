import { Router } from "express"
import { AuthController } from "./auth.controller.js"
import { validate } from "@/middleware/validator.js"
import { authenticate } from "@/middleware/authenticate.js"
import { dailyRateLimitByIp } from "@/middleware/rateLimit.js"
import { magicLinkSchema, magicLinkVerifySchema, exchangeTicketSchema } from "./auth.schema.js"

const router: Router = Router()

router.get(
    "/check-email",
    dailyRateLimitByIp("check-email", 100),
    AuthController.checkEmail
)

router.get("/google", AuthController.googleRedirect)
router.get("/google/callback", AuthController.googleCallback)
router.get("/github", AuthController.githubRedirect)
router.get("/github/callback", AuthController.githubCallback)

router.post(
    "/exchange-ticket",
    validate(exchangeTicketSchema),
    AuthController.exchangeTicket
)

router.post(
    "/magic-link",
    dailyRateLimitByIp("magic-link", 10),
    validate(magicLinkSchema),
    AuthController.magicLink
)
router.post(
    "/magic-link/verify",
    validate(magicLinkVerifySchema),
    AuthController.magicLinkVerify
)

router.post("/refresh", AuthController.refresh)
router.post("/logout", AuthController.logout)
router.get("/me", authenticate, AuthController.me)

export default router
