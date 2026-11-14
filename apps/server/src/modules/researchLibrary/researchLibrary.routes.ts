import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { minuteRateLimit } from "@/middleware/rateLimit.js"
import { ResearchLibraryController } from "./researchLibrary.controller.js"

const router: Router = Router()

router.use(authenticate)

router.get("/access", minuteRateLimit("research-library-meta", 60), ResearchLibraryController.access)
router.get("/categories", minuteRateLimit("research-library-meta", 60), ResearchLibraryController.categories)
router.get("/findings", minuteRateLimit("research-library-list", 60), ResearchLibraryController.list)
router.get("/findings/:slug", minuteRateLimit("research-library-detail", 120), ResearchLibraryController.detail)

export default router
