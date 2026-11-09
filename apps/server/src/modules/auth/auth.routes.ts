import { Router, type NextFunction, type Request, type Response } from "express"
import { env } from "@/config/env.js"
import { AuthController } from "./auth.controller.js"
import { validate } from "@/middleware/validator.js"
import { authenticate } from "@/middleware/authenticate.js"
import { dailyRateLimitByIp } from "@/middleware/rateLimit.js"
import {
    magicLinkSchema,
    magicLinkVerifySchema,
    exchangeTicketSchema,
    reviewerLoginSchema,
} from "./auth.schema.js"

const router: Router = Router()

// Same body as the app's catch-all 404, so a disabled reviewer login looks like no route at all.
function reviewerLoginEnabled(_req: Request, res: Response, next: NextFunction): void {
    if (env.REVIEWER_LOGIN_ENABLED) return next()
    res.status(404).json({ success: false, message: "Route not found" })
}

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

router.get("/reviewer-login", reviewerLoginEnabled, AuthController.reviewerLoginStatus)
router.post(
    "/reviewer-login",
    reviewerLoginEnabled,
    validate(reviewerLoginSchema),
    AuthController.reviewerLogin
)

router.post("/refresh", AuthController.refresh)
router.post("/logout", AuthController.logout)
router.get("/me", authenticate, AuthController.me)

export default router
