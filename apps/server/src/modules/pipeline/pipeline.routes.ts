import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { PipelineController } from "./pipeline.controller.js"
import { SetPipelineModeSchema } from "./pipeline.schema.js"

const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.get("/", PipelineController.get)
router.patch("/mode", validate(SetPipelineModeSchema), PipelineController.setMode)

export default router
