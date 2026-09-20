import { Router, type Request, type Response, type NextFunction } from "express"
import { ChatRequestSchema } from "@repo/schemas"
import { verifyToken } from "@/lib/auth.js"
import { runChat } from "@/agents/chat.agent.js"

const router: Router = Router()

router.post(
  "/chat",
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      verifyToken(req)
    } catch (err) {
      console.error("[chat] auth failed:", err instanceof Error ? err.message : err)
      res.status(401).json({ success: false, message: "Unauthorized" })
      return
    }

    const parsed = ChatRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      })
      return
    }

    runChat(parsed.data)
      .then((result) => {
        res.status(200).json({ success: true, data: result })
      })
      .catch((err) => {
        console.error("[chat] failed:", err instanceof Error ? err.message : err)
        next(err)
      })
  }
)

export default router
