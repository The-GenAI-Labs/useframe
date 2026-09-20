import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { SeoStepController } from "./seoStep.controller.js"
import { SeoStepRejectSchema } from "./seoStep.schema.js"

const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.post("/generate", SeoStepController.generate)
router.post("/approve", SeoStepController.approve)
router.post("/reject", validate(SeoStepRejectSchema), SeoStepController.reject)

export default router
