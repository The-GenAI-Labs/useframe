import { Router } from "express"
import { env } from "@/config/env.js"
import { authenticate } from "@/middleware/authenticate.js"
import { hourlyRateLimit } from "@/middleware/rateLimit.js"
import { validate } from "@/middleware/validator.js"
import { DomainsController } from "./domains.controller.js"
import { AddDomainSchema } from "./domains.schema.js"

const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.get("/", DomainsController.get)
router.post(
  "/",
  hourlyRateLimit("domain-add", env.CUSTOM_DOMAIN_MAX_ADD_PER_HOUR),
  validate(AddDomainSchema),
  DomainsController.add
)
router.post("/:domainId/check", DomainsController.check)
router.post("/:domainId/retry", DomainsController.retry)
router.delete("/:domainId", DomainsController.remove)

export default router
