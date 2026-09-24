import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { ReplicateController } from "./replicate.controller.js"
import { ReplicateRequestSchema } from "./replicate.schema.js"

const router: Router = Router()

router.use(authenticate)
router.post("/", validate(ReplicateRequestSchema), ReplicateController.create)

export default router
