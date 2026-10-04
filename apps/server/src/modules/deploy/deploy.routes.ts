import { Router } from "express"
import { env } from "@/config/env.js"
import { authenticate } from "@/middleware/authenticate.js"
import { hourlyRateLimit } from "@/middleware/rateLimit.js"
import { DeployController } from "./deploy.controller.js"

const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.post(
  "/deploy",
  hourlyRateLimit("deploy", env.DEPLOY_USER_RATE_LIMIT_PER_HOUR),
  DeployController.create
)
router.get("/deployments", DeployController.list)
router.get("/deployments/:deploymentId", DeployController.get)
router.post("/deployments/:deploymentId/rollback", DeployController.rollback)
router.get("/site", DeployController.site)

export default router
