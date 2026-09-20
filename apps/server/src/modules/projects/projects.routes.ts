import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { ProjectsController } from "./projects.controller.js"
import { CreateProjectSchema, UpdateProjectSchema } from "./projects.schema.js"
import { MessagesController } from "@/modules/messages/messages.controller.js"
import { SendMessageSchema } from "@/modules/messages/messages.schema.js"
import planRoutes from "@/modules/plan/plan.routes.js"
import websiteRoutes from "@/modules/website/website.routes.js"
import seoStepRoutes from "@/modules/seoStep/seoStep.routes.js"
import deployRoutes from "@/modules/deploy/deploy.routes.js"
import pipelineRoutes from "@/modules/pipeline/pipeline.routes.js"
import domainsRoutes from "@/modules/domains/domains.routes.js"

const router: Router = Router()

router.use(authenticate)

router.post("/", validate(CreateProjectSchema), ProjectsController.create)
router.get("/", ProjectsController.list)
router.get("/:slug", ProjectsController.getBySlug)
router.patch("/:slug", validate(UpdateProjectSchema), ProjectsController.update)
router.get("/:slug/versions", ProjectsController.listVersions)
router.post("/:slug/versions", ProjectsController.createVersion)
router.get("/:slug/versions/:versionId", ProjectsController.getVersion)
router.get("/:slug/versions/:versionId/snapshot", ProjectsController.getVersionSnapshot)
router.post("/:slug/versions/:versionId/restore", ProjectsController.restoreVersion)
router.get("/:slug/research-report", ProjectsController.getResearchReport)
router.post("/:slug/messages", validate(SendMessageSchema), MessagesController.send)
router.use("/:slug/research", planRoutes)
router.use("/:slug/website", websiteRoutes)
router.use("/:slug/seo-step", seoStepRoutes)
router.use("/:slug/deploy", deployRoutes)
router.use("/:slug/pipeline", pipelineRoutes)
router.use("/:slug/domains", domainsRoutes)

export default router
