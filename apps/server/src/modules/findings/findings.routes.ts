import { Router } from "express"
import { FindingsController } from "./findings.controller.js"

// Public — no authenticate() — findings are non-sensitive research corpus
// entries, and the citation-hover tooltip's "Read the finding" link needs
// to work for a logged-out visitor of a deployed generated site.
const router: Router = Router()

router.get("/:id", FindingsController.get)

export default router
