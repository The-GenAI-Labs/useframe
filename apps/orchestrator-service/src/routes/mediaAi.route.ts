import express, { Router, type Request, type Response } from "express"
import { z } from "zod"
import { ROUTING_KEYS } from "@repo/media-ai"
import { isValidationWorker as isInternalService } from "@/lib/internalValidationAuth.js"
import { mediaLlm } from "@/llm/claude.js"

const router: Router = Router()

const LlmRequestSchema = z.object({
  routingKey: z.enum(ROUTING_KEYS),
  system: z.string().min(1).max(60_000),
  prompt: z.string().min(1).max(200_000),
  images: z
    .array(z.object({ mime: z.enum(["image/png", "image/webp", "image/jpeg"]), base64: z.string().min(1).max(12_000_000) }))
    .max(5)
    .optional(),
  maxTokens: z.number().int().min(256).max(64_000).optional(),
  purpose: z.string().regex(/^[a-z0-9._-]{1,40}$/),
})

// apps/media-service only: model routing and provider keys stay in this service.
router.post("/internal/media-ai/llm", express.json({ limit: "40mb" }), (req: Request, res: Response): void => {
  if (!isInternalService(req)) {
    res.status(401).json({ success: false, message: "Unauthorized" })
    return
  }
  const parsed = LlmRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Validation failed" })
    return
  }
  void mediaLlm
    .complete(parsed.data)
    .then((data) => res.json({ success: true, data }))
    .catch((err: unknown) => {
      console.error("[media-ai] llm call failed:", parsed.data.purpose, err instanceof Error ? err.name : "unknown")
      if (!res.headersSent) res.status(502).json({ success: false, message: "Model call failed" })
    })
})

export default router
