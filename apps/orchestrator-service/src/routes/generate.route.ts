import { Router, type Request, type Response, type NextFunction } from "express"
import { GenerateRequestSchema } from "@repo/schemas"
import { initSSE } from "@/llm/stream.js"
import { runOrchestrator } from "@/agents/orchestrator.js"
import { verifyToken } from "@/lib/auth.js"

const router: Router = Router()

router.post(
  "/generate",
  (req: Request, res: Response, next: NextFunction): void => {
    let user: { id: string; email: string; plan: string }
    try {
      user = verifyToken(req)
    } catch (err) {
      console.error("[generate] auth failed:", err instanceof Error ? err.message : err)
      res.status(401).json({ success: false, message: "Unauthorized" })
      return
    }

    const parsed = GenerateRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      })
      return
    }

    initSSE(res)

    runOrchestrator(res, parsed.data, user.id).catch(next)
  }
)

export default router
