import { Router, type Request, type Response, type NextFunction } from "express"
import { ResearchAgentRequestSchema } from "@repo/schemas"
import { verifyToken } from "@/lib/auth.js"
import { runResearchAgent } from "@/agents/research.agent.js"
import { getDeepseekModel, DEEPSEEK_HIGH_REASONING_OPTIONS } from "@/llm/providers.js"

const router: Router = Router()

router.post(
  "/research",
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      verifyToken(req)
    } catch (err) {
      console.error("[research] auth failed:", err instanceof Error ? err.message : err)
      res.status(401).json({ success: false, message: "Unauthorized" })
      return
    }

    const parsed = ResearchAgentRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      })
      return
    }

    const model = getDeepseekModel()

    runResearchAgent(parsed.data, model, DEEPSEEK_HIGH_REASONING_OPTIONS)
      .then((result) => {
        res.status(200).json({ success: true, data: result })
      })
      .catch((err) => {
        console.error("[research] failed:", err instanceof Error ? err.message : err)
        next(err)
      })
  }
)

export default router
