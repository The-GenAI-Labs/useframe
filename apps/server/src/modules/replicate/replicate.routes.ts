import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { ReplicateController } from "./replicate.controller.js"
import { ReplicateRequestSchema } from "./replicate.schema.js"
import { ReplicateMessagesController } from "./replicateMessages.controller.js"
import { ReplicateMessageSchema } from "./replicateMessages.schema.js"

const router: Router = Router()

router.use(authenticate)
router.post("/", validate(ReplicateRequestSchema), ReplicateController.create)
router.get("/", ReplicateController.list)
router.get("/:slug", ReplicateController.getBySlug)
router.post("/:slug/messages", validate(ReplicateMessageSchema), ReplicateMessagesController.send)

export default router
