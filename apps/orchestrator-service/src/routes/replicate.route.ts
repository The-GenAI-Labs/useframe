import { Router, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { initSSE } from "@/llm/stream.js"
import { runReplicationOrchestrator } from "@/agents/replicationOrchestrator.js"
import { verifyToken } from "@/lib/auth.js"

const router: Router = Router()

const ReplicateGenerateSchema = z.object({
  replicationId: z.string(),
  buildSpec: z.string().min(1),
  tier: z.enum(["free", "paid"]),
})

router.post(
  "/replicate/generate",
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      verifyToken(req)
    } catch (err) {
      console.error("[replicate/generate] auth failed:", err instanceof Error ? err.message : err)
      res.status(401).json({ success: false, message: "Unauthorized" })
      return
    }

    const parsed = ReplicateGenerateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      })
      return
    }

    initSSE(res)

    const { replicationId, buildSpec, tier } = parsed.data
    runReplicationOrchestrator(res, replicationId, buildSpec, tier).catch(next)
  }
)

export default router
