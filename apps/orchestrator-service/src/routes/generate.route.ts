import { Router, type Request, type Response, type NextFunction } from "express"
import jwt from "jsonwebtoken"
import { GenerateRequestSchema } from "@repo/schemas"
import { initSSE } from "@/llm/stream.js"
import { runOrchestrator } from "@/agents/orchestrator.js"
import { env } from "@/config/env.js"

const router: Router = Router()

function verifyToken(req: Request): { id: string; email: string; plan: string } {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("No token provided")
  }
  const token = authHeader.split(" ")[1]!
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
    id: string
    email: string
    plan: string
    type: string
  }
  if (payload.type !== "access") throw new Error("Invalid token type")
  return { id: payload.id, email: payload.email, plan: payload.plan }
}

router.post(
  "/generate",
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      verifyToken(req)
    } catch {
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

    runOrchestrator(res, parsed.data).catch(next)
  }
)

export default router
