import express, { Router, type Request, type Response } from "express"
import { generateText } from "ai"
import { z } from "zod"
import { MEDIA_PURPOSES, MediaDescribeOutputSchema } from "@repo/schemas"
import { isValidationWorker as isInternalService } from "@/lib/internalValidationAuth.js"
import { getVisionModelForTier } from "@/llm/router.js"
import { parseJsonObject } from "@/agents/briefPrefill.agent.js"
import { MEDIA_DESCRIBE_SYSTEM } from "@/prompts/media.prompt.js"

const router: Router = Router()

const DescribeRequestSchema = z.object({
  image: z.string().min(1).max(4_000_000),
  mime: z.enum(["image/webp", "image/jpeg", "image/png"]),
  tier: z.enum(["free", "paid"]),
})

const DESCRIBE_TIMEOUT_MS = 25_000

// apps/media-service only; receives pixels and a tier, never names or user ids.
router.post(
  "/internal/media/describe",
  express.json({ limit: "4mb" }),
  (req: Request, res: Response): void => {
    if (!isInternalService(req)) {
      res.status(401).json({ success: false, message: "Unauthorized" })
      return
    }
    const parsed = DescribeRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ success: false, message: "Validation failed" })
      return
    }
    const { image, mime, tier } = parsed.data
    void (async () => {
      try {
        const { text } = await generateText({
          model: getVisionModelForTier(tier),
          system: MEDIA_DESCRIBE_SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this image." },
                { type: "image", image: Buffer.from(image, "base64"), mimeType: mime },
              ],
            },
          ],
          maxTokens: 600,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(DESCRIBE_TIMEOUT_MS),
          experimental_telemetry: { isEnabled: true, functionId: "media-describe" },
        })
        const raw = parseJsonObject(text) as Record<string, unknown> | null
        const output = MediaDescribeOutputSchema.safeParse(
          raw && {
            ...raw,
            description: typeof raw.description === "string" ? raw.description.slice(0, 300) : raw.description,
            altText: typeof raw.altText === "string" ? raw.altText.slice(0, 125) : raw.altText,
            suggestedPurposes: Array.isArray(raw.suggestedPurposes)
              ? raw.suggestedPurposes.filter((p) => (MEDIA_PURPOSES as readonly unknown[]).includes(p)).slice(0, 6)
              : [],
          },
        )
        if (!output.success) {
          res.status(422).json({ success: false, message: "Malformed description" })
          return
        }
        res.json({ success: true, data: output.data })
      } catch (err) {
        console.error("[media-describe] failed:", err instanceof Error ? err.message : err)
        if (!res.headersSent) res.status(502).json({ success: false, message: "Describe failed" })
      }
    })()
  },
)

export default router
