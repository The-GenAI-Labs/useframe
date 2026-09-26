import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { initSSE, sseWrite, sseError } from "@/llm/stream.js"
import { runReplicationOrchestrator } from "@/agents/replicationOrchestrator.js"
import { verifyToken } from "@/lib/auth.js"
import { prisma } from "@useframe/db"

const router: Router = Router()
const generating = new Set<string>()
const GeneratedFilesSchema = z
  .array(z.object({ path: z.string().min(1), content: z.string() }))
  .min(1)

const ReplicateGenerateSchema = z.object({
  replicationId: z.string().min(1),
  buildSpec: z.string().min(1).optional(),
  tier: z.enum(["free", "paid"]).optional(),
})

router.post("/replicate/generate", async (req: Request, res: Response): Promise<void> => {
  let user: ReturnType<typeof verifyToken>
  try {
    user = verifyToken(req)
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

  const { replicationId } = parsed.data
  try {
    const replication = await prisma.replication.findFirst({
      where: { id: replicationId, userId: user.id },
      select: { status: true, buildSpec: true, tier: true, nextFiles: true },
    })
    if (!replication) {
      res.status(404).json({ success: false, message: "Replication not found" })
      return
    }
    const files = GeneratedFilesSchema.safeParse(replication.nextFiles)
    if (replication.status === "READY" && files.success) {
      initSSE(res)
      sseWrite(res, {
        type: "next_files_ready",
        versionId: replicationId,
        files: files.data,
      })
      res.end()
      return
    }
    if (!replication.buildSpec?.trim() || !["GENERATING", "FAILED"].includes(replication.status)) {
      res.status(409).json({
        success: false,
        message: "Replication is not ready for code generation",
      })
      return
    }
    if (generating.has(replicationId)) {
      initSSE(res)
      sseWrite(res, {
        type: "stage",
        stage: "GENERATE",
        message: "Generation is already running. Waiting for the result...",
      })
      res.end()
      return
    }
    generating.add(replicationId)
    try {
      await prisma.replication.update({
        where: { id: replicationId, userId: user.id },
        data: { status: "GENERATING", failureReason: null },
      })
      initSSE(res)
      await runReplicationOrchestrator(
        res,
        replicationId,
        replication.buildSpec,
        replication.tier === "FREE" ? "free" : "paid",
      )
    } finally {
      generating.delete(replicationId)
    }
  } catch (error) {
    console.error(
      "[replicate/generate] failed",
      error instanceof Error ? error.message : "Unknown error",
    )
    if (res.headersSent) {
      if (!res.writableEnded) {
        sseError(res, "Unable to complete generation. Please retry.")
        res.end()
      }
    } else {
      res.status(503).json({
        success: false,
        message: "Unable to start generation. Please retry.",
      })
    }
  }
})

export default router
