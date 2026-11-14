import { Router } from "express"
import { ResearchArticlesController } from "./researchArticles.controller.js"

// Public: articles are the indexable reading pages, rendered for logged-out visitors and crawlers.
const router: Router = Router()

router.get("/", ResearchArticlesController.list)
router.get("/:slug", ResearchArticlesController.get)

export default router
