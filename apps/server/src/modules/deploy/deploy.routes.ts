import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { DeployController } from "./deploy.controller.js"

const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.post("/", DeployController.create)
router.get("/:deploymentId", DeployController.get)
router.post("/approve", DeployController.approve)

export default router
