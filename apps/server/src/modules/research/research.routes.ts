import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { ResearchController } from "./research.controller.js"
import { ResearchGenerateSchema, ResearchRejectSchema } from "./research.schema.js"

const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.post("/generate", validate(ResearchGenerateSchema), ResearchController.generate)
router.post("/approve", ResearchController.approve)
router.post("/reject", validate(ResearchRejectSchema), ResearchController.reject)

export default router
