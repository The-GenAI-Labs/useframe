import { z } from "zod"

export const ModelIdSchema = z.enum([
  "claude-sonnet-4-6",
  "claude-opus-4-8",
  "claude-haiku-4-5-20251001",
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "gpt-4o",
  "gpt-4o-mini",
  "kimi-k2-6",
])

export type ModelId = z.infer<typeof ModelIdSchema>

export type ModelProvider = "anthropic" | "deepseek" | "openai" | "kimi"

export type ModelMeta = {
  id: ModelId
  label: string
  provider: ModelProvider
  description: string
}

export const MODELS: ModelMeta[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    description: "Fast, intelligent — best for most tasks",
  },
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    provider: "anthropic",
    description: "Most capable Claude — highest quality output",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Fastest Claude — great for quick iterations",
  },
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    provider: "deepseek",
    description: "Lightweight DeepSeek — rapid responses",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro",
    provider: "deepseek",
    description: "Full DeepSeek — strong reasoning and code",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    description: "OpenAI flagship — multimodal, highly capable",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "openai",
    description: "Smaller GPT-4o — fast and cost-efficient",
  },
  {
    id: "kimi-k2-6",
    label: "Kimi K2.6",
    provider: "kimi",
    description: "Moonshot AI — strong long-context reasoning",
  },
]

export const DEFAULT_MODEL_ID: ModelId = "claude-sonnet-4-6"
