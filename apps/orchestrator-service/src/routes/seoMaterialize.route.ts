import { Router, type Request, type Response, type NextFunction } from "express"
import { SeoMaterializeRequestSchema } from "@repo/schemas"
import { verifyToken } from "@/lib/auth.js"
import { runSeoMaterializeAgent } from "@/agents/seoMaterialize.agent.js"
import { getDeepseekModel, DEEPSEEK_HIGH_REASONING_OPTIONS } from "@/llm/providers.js"

const router: Router = Router()

router.post(
  "/seo/materialize",
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      verifyToken(req)
    } catch (err) {
      console.error("[seo/materialize] auth failed:", err instanceof Error ? err.message : err)
      res.status(401).json({ success: false, message: "Unauthorized" })
      return
    }

    const parsed = SeoMaterializeRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      })
      return
    }

    const model = getDeepseekModel()

    runSeoMaterializeAgent(parsed.data, model, DEEPSEEK_HIGH_REASONING_OPTIONS)
      .then((result) => {
        res.status(200).json({ success: true, data: result })
      })
      .catch((err) => {
        console.error("[seo/materialize] failed:", err instanceof Error ? err.message : err)
        next(err)
      })
  }
)

export default router
