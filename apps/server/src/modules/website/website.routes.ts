import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { WebsiteController } from "./website.controller.js"
import { WebsiteRejectSchema } from "./website.schema.js"

const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.post("/approve", WebsiteController.approve)
router.post("/reject", validate(WebsiteRejectSchema), WebsiteController.reject)

export default router
