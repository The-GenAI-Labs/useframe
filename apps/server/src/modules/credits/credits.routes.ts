import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { CreditsController } from "./credits.controller.js"

const router: Router = Router()

router.use(authenticate)

router.get("/", CreditsController.getSummary)

export default router
