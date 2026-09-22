import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { PlanController } from "./plan.controller.js"
import {
  PlanGenerateSchema,
  PlanPdfSchema,
  PlanRejectSchema,
  PlanSelectSchema,
  PlanUpdateSchema,
} from "./plan.schema.js"

const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.get("/", PlanController.get)
router.put("/", validate(PlanUpdateSchema), PlanController.update)
router.post("/generate", validate(PlanGenerateSchema), PlanController.generate)
router.post("/approve", PlanController.approve)
router.post("/select", validate(PlanSelectSchema), PlanController.select)
router.post("/pdf", validate(PlanPdfSchema), PlanController.requestPdf)
router.post("/reject", validate(PlanRejectSchema), PlanController.reject)
router.get("/finding/:findingId", PlanController.getFinding)

export default router
