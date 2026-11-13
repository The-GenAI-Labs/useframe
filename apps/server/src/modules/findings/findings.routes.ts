import { Router } from "express"
import { FindingsController } from "./findings.controller.js"

// Public, so old /research/<finding id> links still resolve. It returns only the
// slug and title; the finding itself is gated by /api/research/library.
const router: Router = Router()

router.get("/:id", FindingsController.get)

export default router
