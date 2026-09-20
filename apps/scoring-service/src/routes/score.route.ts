import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { ScoreJobPayload } from "@repo/events"
import { prisma, resolveContext, getCachedAnalysis } from "@useframe/db"
import { redis } from "@/lib/redis.js"
import { CURRENT_SCORER_VERSION } from "@/config/scoring.js"

const router: Router = Router()

const scoreQueue = new Queue<ScoreJobPayload>(QUEUES.SCORE, { connection: redis })

const ANALYSIS_TYPE = "web_score"

const CreateScoreSchema = z.object({
  url: z.string().url().refine((u) => u.startsWith("https://") || u.startsWith("http://"), {
    message: "URL must start with http:// or https://",
  }),
  userId: z.string().min(1),
  force: z.boolean().optional(),
})

router.post("/score", (req: Request, res: Response, next) => {
  const parsed = CreateScoreSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const { url, userId, force } = parsed.data

  async function run() {
    if (!force) {
      const context = await resolveContext(url, userId)
      const cached = await getCachedAnalysis(url, ANALYSIS_TYPE, CURRENT_SCORER_VERSION, context)
      if (cached) {
        const newRow = await prisma.scoreResult.create({
          data: {
            url,
            userId,
            status: "DONE",
            report: cached.report ?? undefined,
            screenshotBase64: cached.screenshotBase64,
            normalizedUrl: cached.normalizedUrl,
            analysisType: ANALYSIS_TYPE,
            scorerVersion: CURRENT_SCORER_VERSION,
            expiresAt: cached.expiresAt,
          },
        })
        res.status(201).json({ success: true, data: { scoreId: newRow.id, cached: true } })
        return
      }
    }

    const scoreResult = await prisma.scoreResult.create({ data: { url, userId, status: "PENDING" } })
    const payload: ScoreJobPayload = { scoreId: scoreResult.id, url }
    await scoreQueue.add("score", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    })
    res.status(201).json({ success: true, data: { scoreId: scoreResult.id, cached: false } })
  }

  run().catch(next)
})

router.get("/score/:scoreId", (req: Request, res: Response, next) => {
  prisma.scoreResult
    .findUnique({
      where: { id: req.params.scoreId },
      select: { status: true, report: true, url: true, failureReason: true },
    })
    .then((result: { status: string; report: unknown; url: string; failureReason: string | null } | null) => {
      if (!result) {
        res.status(404).json({ success: false, message: "Score not found" })
        return
      }
      res.json({ success: true, data: result })
    })
    .catch(next)
})

router.get("/score/:scoreId/screenshot", (req: Request, res: Response, next) => {
  prisma.scoreResult
    .findUnique({
      where: { id: req.params.scoreId },
      select: { screenshotBase64: true },
    })
    .then((result: { screenshotBase64: string | null } | null) => {
      if (!result?.screenshotBase64) {
        res.status(404).json({ success: false, message: "Screenshot not available" })
        return
      }
      res.json({ success: true, data: { screenshotBase64: result.screenshotBase64 } })
    })
    .catch(next)
})

export default router
