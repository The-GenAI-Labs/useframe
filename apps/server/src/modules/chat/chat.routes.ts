import { Router } from "express"
import { authenticate } from "@/middleware/authenticate.js"
import { validate } from "@/middleware/validator.js"
import { dailyRateLimit } from "@/middleware/rateLimit.js"
import { ChatController } from "./chat.controller.js"
import { SendChatMessageSchema } from "./chat.schema.js"

const router: Router = Router()

router.use(authenticate)

router.post(
  "/messages",
  dailyRateLimit("chat", 50),
  validate(SendChatMessageSchema),
  ChatController.send
)

export default router
