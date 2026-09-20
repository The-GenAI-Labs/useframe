import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { dailyRateLimit } from "@/middleware/rateLimit.js"
import { SeoController } from "./seo.controller.js"
import { CreateSeoAuditSchema } from "./seo.schema.js"

const router: Router = Router()

router.use(authenticate)

router.post(
  "/audit",
  dailyRateLimit("seoAudit", 10),
  validate(CreateSeoAuditSchema),
  SeoController.create
)
router.get("/audit/:id", SeoController.get)

export default router
