import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { ProjectsController } from "./projects.controller.js"
import { CreateProjectSchema, UpdateProjectSchema } from "./projects.schema.js"

const router: Router = Router()

router.use(authenticate)

router.post("/", validate(CreateProjectSchema), ProjectsController.create)
router.get("/", ProjectsController.list)
router.get("/:slug", ProjectsController.getBySlug)
router.patch("/:slug", validate(UpdateProjectSchema), ProjectsController.update)
router.get("/:slug/versions", ProjectsController.listVersions)
router.get("/:slug/versions/:versionId", ProjectsController.getVersion)

export default router
