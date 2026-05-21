import { Router } from "express"
import { AuthController } from "./auth.controller.js"
import { validate } from "@/middleware/validator.js"
import { authenticate } from "@/middleware/authenticate.js"
import { registerSchema, loginSchema } from "./auth.schema.js"

const router: Router = Router()

// public routes
router.post("/register", validate(registerSchema), AuthController.register)
router.post("/login", validate(loginSchema), AuthController.login)
router.post("/refresh", AuthController.refresh)
router.post("/logout", AuthController.logout)

// protected routes
router.get("/me", authenticate, AuthController.me)

export default router