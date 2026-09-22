import { Router, type Request, type Response, type NextFunction } from "express"
import crypto from "node:crypto"
import { z } from "zod"
import { env } from "@/config/env.js"
import { runScore } from "@/agents/score.agent.js"

const router: Router = Router()

function verifyInternalSecret(req: Request): boolean {
  const provided = req.headers["x-internal-secret"]
  if (typeof provided !== "string") return false
  const expected = env.INTERNAL_SERVICE_SECRET
  if (provided.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

const AnalyzeSchema = z.object({
  scoreId: z.string().min(1),
  url: z.string(),
  screenshotBase64: z.string().min(1),
  extractedContent: z.unknown(),
  designTokens: z.unknown(),
  // Measured by the scanning browser (see measurePerformance in the worker).
  // Optional: pages that don't expose navigation timing simply omit the
  // Performance & Speed criterion rather than having it guessed.
  performanceMetrics: z
    .object({
      ttfb: z.number(),
      domContentLoaded: z.number(),
      loadComplete: z.number(),
      lcp: z.number(),
    })
    .optional(),
})

router.post(
  "/analyze",
  (req: Request, res: Response, next: NextFunction): void => {
    if (!verifyInternalSecret(req)) {
      res.status(401).json({ success: false, message: "Unauthorized" })
      return
    }

    const parsed = AnalyzeSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      })
      return
    }

    runScore({
      url: parsed.data.url,
      screenshotBase64: parsed.data.screenshotBase64,
      extractedContent: parsed.data.extractedContent,
      designTokens: parsed.data.designTokens,
      performanceMetrics: parsed.data.performanceMetrics,
    })
      .then((report) => {
        res.status(200).json({ success: true, data: { report } })
      })
      .catch((err) => {
        console.error("[internal/analyze] failed:", err instanceof Error ? err.message : err)
        next(err)
      })
  }
)

export default router
