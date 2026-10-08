import express, { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { hourlyRateLimit, minuteRateLimit } from "@/middleware/rateLimit.js"
import { env } from "@/config/env.js"
import type { AuthenticatedRequest } from "@/types/index.js"
import type { Response, NextFunction } from "express"
import { BriefsController } from "./briefs.controller.js"
import {
  ApproveBriefSchema,
  CreateBriefSchema,
  PatchBriefSchema,
  PrefillBriefSchema,
  type PrefillBriefInput,
} from "./briefs.schema.js"

// Brief bodies (pre-fill text, full drafts) exceed the app-wide 10kb JSON
// limit; mounted ahead of the global parser for these paths only.
export const briefJsonParser = express.json({ limit: "200kb" })

const uploadParser = express.raw({
  type: () => true,
  limit: Math.max(env.BRIEF_DOC_MAX_BYTES, env.BRIEF_LOGO_MAX_BYTES) + 1024,
})

const prefillTextLimit = hourlyRateLimit("brief-prefill", env.BRIEF_RATE_PREFILL_PER_HOUR)
const prefillUrlLimit = hourlyRateLimit("brief-prefill-url", env.BRIEF_RATE_PREFILL_URL_PER_HOUR)

function prefillRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const body = req.body as PrefillBriefInput
  void (body.kind === "url" ? prefillUrlLimit : prefillTextLimit)(req, res, next)
}

const router: Router = Router()

router.use(authenticate)

router.post("/", hourlyRateLimit("brief-create", env.BRIEF_RATE_CREATE_PER_HOUR), validate(CreateBriefSchema), BriefsController.create)
router.get("/", BriefsController.listOpen)
router.get("/:id", BriefsController.get)
router.patch("/:id", minuteRateLimit("brief-patch", 120), validate(PatchBriefSchema), BriefsController.patch)
router.delete("/:id", BriefsController.remove)
router.post("/:id/prefill", validate(PrefillBriefSchema), prefillRateLimit, BriefsController.prefill)
router.post("/:id/uploads", hourlyRateLimit("brief-upload", 10), uploadParser, BriefsController.upload)

export default router

// Mounted under /api/projects/:slug/brief.
export const projectBriefRouter: Router = Router({ mergeParams: true })
projectBriefRouter.use(authenticate)
projectBriefRouter.get("/", BriefsController.getForProject)
projectBriefRouter.patch("/", minuteRateLimit("brief-patch", 120), validate(PatchBriefSchema), BriefsController.patchForProject)
projectBriefRouter.post("/approve", hourlyRateLimit("brief-approve", 10), validate(ApproveBriefSchema), BriefsController.approveForProject)
projectBriefRouter.post("/uploads", hourlyRateLimit("brief-upload", 10), uploadParser, BriefsController.uploadForProject)

// Signed, short-lived logo URLs; the signature is the authorization.
export const briefUploadsPublicRouter: Router = Router()
briefUploadsPublicRouter.get("/:uploadId", BriefsController.serveUpload)
