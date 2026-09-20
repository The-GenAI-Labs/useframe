import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { DomainsController } from "./domains.controller.js"
import { AddDomainSchema } from "./domains.schema.js"

const router: Router = Router({ mergeParams: true })

router.use(authenticate)

router.get("/", DomainsController.get)
router.post("/", validate(AddDomainSchema), DomainsController.add)

export default router
