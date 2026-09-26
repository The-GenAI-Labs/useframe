import { Router, type Request, type Response, type NextFunction } from "express"
import {
  ExtractRequestSchema,
  ExtractAnswerRequestSchema,
  type ExtractedFields,
  type ClarifyQuestion,
} from "@repo/schemas"
import { verifyToken } from "@/lib/auth.js"
import { getModelForTier, getProviderOptionsForTier } from "@/llm/router.js"
import { runClarifyAgent } from "@/agents/clarify.agent.js"

const router: Router = Router()

const MAX_QUESTIONS = 10

// Every extractable field the clarify agent can infer. Any of these left
// undefined after the LLM pass becomes a candidate question — this is what
// makes the question list "fully dynamic" rather than hardcoded to 3.
const FIELD_QUESTIONS: Record<
  Exclude<keyof ExtractedFields, "name">,
  { id: string; question: string; options?: string[] }
> = {
  niche: {
    id: "niche",
    question: "Which category best fits your product?",
  },
  targetAudience: {
    id: "targetAudience",
    question: "Who is your primary target audience?",
  },
  brandPersonality: {
    id: "brandPersonality",
    question: "How would you describe your brand's personality?",
    options: ["Playful", "Bold", "Calm", "Clinical", "Luxurious", "Friendly"],
  },
  pricePositioning: {
    id: "pricePositioning",
    question: "How is your product priced relative to competitors?",
    options: ["Budget", "Mid-range", "Premium"],
  },
  businessModel: {
    id: "businessModel",
    question: "What's your business model?",
    options: ["Subscription", "One-time purchase", "Service/booking", "Marketplace"],
  },
  differentiator: {
    id: "differentiator",
    question: "What sets you apart from alternatives?",
  },
}

function buildQuestions(
  extracted: ExtractedFields,
  llmQuestions: ClarifyQuestion[],
): ClarifyQuestion[] {
  const byId = new Map<string, ClarifyQuestion>()

  for (const q of llmQuestions) {
    byId.set(q.id, q)
  }

  // Any null-valued field not already covered by an LLM-authored question
  // gets a synthesized fallback question, so the list reflects every gap —
  // not just the ones the LLM happened to ask about.
  for (const [field, def] of Object.entries(FIELD_QUESTIONS) as [
    keyof typeof FIELD_QUESTIONS,
    (typeof FIELD_QUESTIONS)[keyof typeof FIELD_QUESTIONS],
  ][]) {
    if (extracted[field] === undefined && !byId.has(field) && !byId.has(def.id)) {
      byId.set(def.id, { id: def.id, question: def.question, options: def.options })
    }
  }

  return Array.from(byId.values()).slice(0, MAX_QUESTIONS)
}

router.post(
  "/extract",
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      verifyToken(req)
    } catch (err) {
      console.error("[extract] auth failed:", err instanceof Error ? err.message : err)
      res.status(401).json({ success: false, message: "Unauthorized" })
      return
    }

    const parsed = ExtractRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      })
      return
    }

    const { ideaText, tier } = parsed.data
    const model = getModelForTier(tier)
    const providerOptions = getProviderOptionsForTier(tier)

    runClarifyAgent({ startupIdea: ideaText }, model, providerOptions)
      .then((result) => {
        const extracted: ExtractedFields = {
          niche: result.niche,
          targetAudience: result.targetAudience,
          name: result.name,
          brandPersonality: result.brandPersonality,
          pricePositioning: result.pricePositioning,
          businessModel: result.businessModel,
          differentiator: result.differentiator,
        }

        const questions = result.ready ? [] : buildQuestions(extracted, result.questions ?? [])

        res.status(200).json({ success: true, data: { extracted, questions } })
      })
      .catch((err) => {
        console.error("[extract] failed:", err instanceof Error ? err.message : err)
        next(err)
      })
  },
)

router.post(
  "/extract/answer",
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      verifyToken(req)
    } catch (err) {
      console.error("[extract/answer] auth failed:", err instanceof Error ? err.message : err)
      res.status(401).json({ success: false, message: "Unauthorized" })
      return
    }

    const parsed = ExtractAnswerRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      })
      return
    }

    const { extracted, answers } = parsed.data

    // Merge answers into extracted, mapping question ids back onto their
    // matching ExtractedFields keys. Skip nulls/empties the user left blank.
    const merged: ExtractedFields = { ...extracted }
    for (const [questionId, answer] of Object.entries(answers)) {
      if (!answer) continue
      if (questionId in FIELD_QUESTIONS || questionId === "name") {
        ;(merged as Record<string, string>)[questionId] = answer
      }
    }

    res.status(200).json({ success: true, data: { extracted: merged } })
  },
)

export default router
