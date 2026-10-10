import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { hourlyRateLimit } from "@/middleware/rateLimit.js"
import { validate } from "@/middleware/validator.js"
import { MediaController } from "./media.controller.js"
import { PatchMediaSchema, ResolveMediaSchema, StartUploadSchema } from "./media.schema.js"

// Mounted under /api/projects/:slug/media.
const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.get("/", MediaController.list)
router.post("/uploads", hourlyRateLimit("media-upload", 60), validate(StartUploadSchema), MediaController.startUpload)
router.post("/uploads/:assetId/complete", hourlyRateLimit("media-complete", 60), MediaController.completeUpload)
router.post("/resolve", validate(ResolveMediaSchema), MediaController.resolve)
router.get("/:assetId", MediaController.get)
router.patch("/:assetId", validate(PatchMediaSchema), MediaController.patch)
router.delete("/:assetId", hourlyRateLimit("media-delete", 120), MediaController.remove)
router.post("/:assetId/retry", hourlyRateLimit("media-retry", 60), MediaController.retry)

export default router

// Mounted under /api/media.
export const mediaAccountRouter: Router = Router()
mediaAccountRouter.use(authenticate)
mediaAccountRouter.get("/quota", MediaController.quota)
