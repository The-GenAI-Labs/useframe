import type { Response } from "express"
import type { SSEEvent } from "@repo/schemas"

export function sseWrite(res: Response, event: SSEEvent): void {
  const eventName = event.type
  const data = JSON.stringify(event)
  res.write(`event: ${eventName}\ndata: ${data}\n\n`)
}

export function sseError(res: Response, message: string): void {
  sseWrite(res, { type: "error", message })
}

export function sseStage(
  res: Response,
  stage: SSEEvent & { type: "stage" },
): void {
  sseWrite(res, stage)
}

export function initSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()
}
