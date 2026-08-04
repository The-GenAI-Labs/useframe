import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAI as createOpenAICompat } from "@ai-sdk/openai"
import type { LanguageModelV1 } from "ai"
import { env } from "@/config/env.js"
import type { ModelId, ModelProvider } from "@repo/schemas"
import { MODELS, DEFAULT_MODEL_ID } from "@repo/schemas"

const anthropicProvider = createAnthropic({
  apiKey: env.ANTHROPIC_API_KEY,
})

const deepseekProvider = createOpenAICompat({
  apiKey: env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1",
  name: "deepseek",
})

const openaiProvider = createOpenAI({
  apiKey: env.OPENAI_API_KEY,
})

const kimiProvider = createOpenAICompat({
  apiKey: env.KIMI_API_KEY,
  baseURL: "https://api.moonshot.cn/v1",
  name: "kimi",
})

const PROVIDER_MODEL_MAP: Record<ModelId, { provider: ModelProvider; apiModel: string }> = {
  "claude-sonnet-4-6":         { provider: "anthropic", apiModel: "claude-sonnet-4-6" },
  "claude-opus-4-8":           { provider: "anthropic", apiModel: "claude-opus-4-8" },
  "claude-haiku-4-5-20251001": { provider: "anthropic", apiModel: "claude-haiku-4-5-20251001" },
  "deepseek-v4-flash":         { provider: "deepseek",  apiModel: "deepseek-chat" },
  "deepseek-v4-pro":           { provider: "deepseek",  apiModel: "deepseek-reasoner" },
  "gpt-4o":                    { provider: "openai",    apiModel: "gpt-4o" },
  "gpt-4o-mini":               { provider: "openai",    apiModel: "gpt-4o-mini" },
  "kimi-k2-6":                 { provider: "kimi",      apiModel: "moonshot-v1-8k" },
}

export function getModel(modelId: ModelId = DEFAULT_MODEL_ID): LanguageModelV1 {
  const entry = PROVIDER_MODEL_MAP[modelId]

  switch (entry.provider) {
    case "anthropic":
      return anthropicProvider(entry.apiModel) as LanguageModelV1

    case "deepseek":
      if (!env.DEEPSEEK_API_KEY) {
        console.warn(`[llm] DeepSeek key not set — falling back to ${DEFAULT_MODEL_ID}`)
        return getModel(DEFAULT_MODEL_ID)
      }
      return deepseekProvider(entry.apiModel) as LanguageModelV1

    case "openai":
      if (!env.OPENAI_API_KEY) {
        console.warn(`[llm] OpenAI key not set — falling back to ${DEFAULT_MODEL_ID}`)
        return getModel(DEFAULT_MODEL_ID)
      }
      return openaiProvider(entry.apiModel) as LanguageModelV1

    case "kimi":
      if (!env.KIMI_API_KEY) {
        console.warn(`[llm] Kimi key not set — falling back to ${DEFAULT_MODEL_ID}`)
        return getModel(DEFAULT_MODEL_ID)
      }
      return kimiProvider(entry.apiModel) as LanguageModelV1

    default:
      return anthropicProvider(PROVIDER_MODEL_MAP[DEFAULT_MODEL_ID]!.apiModel) as LanguageModelV1
  }
}

export { MODELS, DEFAULT_MODEL_ID }
