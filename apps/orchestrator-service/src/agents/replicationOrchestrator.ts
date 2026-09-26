import type { Response } from "express"
import { sseWrite, sseError } from "@/llm/stream.js"
import { generateReplicationNextFiles } from "./replicationNextGen.js"
import { prisma } from "@useframe/db"
import type { Tier } from "@repo/schemas"

export async function runReplicationOrchestrator(
  res: Response,
  replicationId: string,
  buildSpec: string,
  tier: Tier,
): Promise<void> {
  const heartbeat = setInterval(() => {
    if (!res.destroyed && !res.writableEnded) res.write(": keep-alive\n\n")
  }, 15_000)
  const stopHeartbeat = () => clearInterval(heartbeat)
  res.once("close", stopHeartbeat)
  try {
    sseWrite(res, {
      type: "stage",
      stage: "GENERATE",
      message: "Writing Next.js code...",
    })

    const files = await generateReplicationNextFiles(buildSpec, tier, (message) => {
      sseWrite(res, { type: "stage", stage: "GENERATE", message })
    })

    await prisma.replication.update({
      where: { id: replicationId },
      data: { nextFiles: files, status: "READY", failureReason: null },
    })

    sseWrite(res, {
      type: "next_files_ready",
      versionId: replicationId,
      files,
    })
    sseWrite(res, {
      type: "stage",
      stage: "COMPLETE",
      message: "Generation complete.",
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed"
    sseError(res, message)

    await prisma.replication
      .update({
        where: { id: replicationId },
        data: { status: "FAILED", failureReason: message },
      })
      .catch(() => {})
  } finally {
    stopHeartbeat()
    res.off("close", stopHeartbeat)
    if (!res.writableEnded) res.end()
  }
}
