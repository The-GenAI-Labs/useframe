import { Router } from "express"
import { PlansController } from "./plans.controller.js"

// Public: the pricing page renders before sign-in.
const router: Router = Router()

router.get("/", PlansController.list)

export default router
