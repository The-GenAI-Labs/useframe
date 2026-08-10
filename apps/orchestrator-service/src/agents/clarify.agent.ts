import { generateText } from "ai"
import type { LanguageModelV1 } from "ai"
import type { ClarifyRequest, ClarifyResponse } from "@repo/schemas"
import { DEFAULT_CLARIFY_PROMPT } from "@/prompts/clarify.prompt.js"

export async function runClarifyAgent(
  request: ClarifyRequest,
  model: LanguageModelV1,
): Promise<ClarifyResponse> {
  const prompt = DEFAULT_CLARIFY_PROMPT({
    startupIdea: request.startupIdea,
    answers: request.answers,
  })

  const { text } = await generateText({ model, prompt, maxTokens: 500 })

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error("No JSON in clarify response")
    const parsed = JSON.parse(jsonMatch[0]) as ClarifyResponse

    return {
      ready: parsed.ready ?? false,
      questions: parsed.questions,
      niche: parsed.niche,
      targetAudience: parsed.targetAudience,
      name: parsed.name,
    }
  } catch {
    return {
      ready: true,
      niche: "OTHER",
      targetAudience: "General audience",
      name: request.startupIdea.slice(0, 40),
    }
  }
}
