import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { dailyRateLimit } from "@/middleware/rateLimit.js"
import { ScoreController } from "./score.controller.js"
import { CreateScoreSchema } from "./score.schema.js"

const router: Router = Router()

router.use(authenticate)

router.post(
  "/",
  dailyRateLimit("score", 10),
  validate(CreateScoreSchema),
  ScoreController.create
)
router.get("/:scoreId", ScoreController.get)
router.get("/:scoreId/screenshot", ScoreController.getScreenshot)

export default router
