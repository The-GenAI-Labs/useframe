import { Router, type Request, type Response } from "express"
import jwt from "jsonwebtoken"
import { ClarifyRequestSchema } from "@repo/schemas"
import { runClarifyAgent } from "@/agents/clarify.agent.js"
import { getModel } from "@/llm/providers.js"
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

router.post("/clarify", async (req: Request, res: Response): Promise<void> => {
  try {
    verifyToken(req)
  } catch {
    res.status(401).json({ success: false, message: "Unauthorized" })
    return
  }

  const parsed = ClarifyRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    })
    return
  }

  try {
    const model = getModel()
    const result = await runClarifyAgent(parsed.data, model)
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err instanceof Error ? err.message : "Clarify failed",
    })
  }
})

export default router
