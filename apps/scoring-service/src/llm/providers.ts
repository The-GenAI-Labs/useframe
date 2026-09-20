import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import type { LanguageModelV1 } from "ai"
import { env } from "@/config/env.js"

const anthropicProvider = createAnthropic({
  apiKey: env.ANTHROPIC_API_KEY,
})

const openaiProvider = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
})

export function getVisionModel(): LanguageModelV1 {
  if (env.ANTHROPIC_API_KEY) {
    return anthropicProvider("claude-sonnet-4-6") as LanguageModelV1
  }
  if (env.OPENAI_API_KEY) {
    return openaiProvider("gpt-4o") as LanguageModelV1
  }
  throw new Error("No vision-capable LLM provider is configured")
}
