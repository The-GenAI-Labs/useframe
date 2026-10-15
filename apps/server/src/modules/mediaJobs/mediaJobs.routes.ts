import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { hourlyRateLimit } from "@/middleware/rateLimit.js"
import { validate } from "@/middleware/validator.js"
import { MediaJobsController } from "./mediaJobs.controller.js"
import { CheckpointActionSchema, StartJobSchema } from "./mediaJobs.schema.js"

// Mounted under /api/projects/:slug/media, ahead of the media library routes.
const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.get("/estimate", MediaJobsController.estimate)
router.post("/jobs", hourlyRateLimit("media-job-start", 10), validate(StartJobSchema), MediaJobsController.start)
router.get("/jobs/latest", MediaJobsController.latest)
router.get("/jobs/:jobId", MediaJobsController.get)
router.post("/jobs/:jobId/checkpoint", hourlyRateLimit("media-checkpoint", 60), validate(CheckpointActionSchema), MediaJobsController.checkpoint)
router.post("/jobs/:jobId/cancel", hourlyRateLimit("media-job-cancel", 30), MediaJobsController.cancel)

export default router
