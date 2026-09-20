import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { GenerateController } from "./generate.controller.js"

const router: Router = Router()

router.use(authenticate)

router.post("/authorize", GenerateController.authorize)

export default router
