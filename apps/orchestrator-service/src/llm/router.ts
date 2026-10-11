import type { LanguageModelV1, ProviderMetadata } from "ai"
import type { Tier } from "@repo/schemas"
import { getClaudeModel, getDeepseekModel, getModel, DEEPSEEK_HIGH_REASONING_OPTIONS } from "./providers.js"
import { env } from "@/config/env.js"

export type { Tier }

// Free tier runs on DeepSeek (cheap, no credit cost to the user). Paid tier
// runs on Claude. This is the single place generation-quality model choice
// is made based on tier — callers should never call getClaudeModel/
// getDeepseekModel directly for tier-gated flows.
export function getModelForTier(tier: Tier): LanguageModelV1 {
  return tier === "paid" ? getClaudeModel() : getDeepseekModel()
}

// Pass as providerOptions on every generateText/generateObject/streamText
// call alongside getModelForTier's model — a no-op on Claude, and puts
// DeepSeek's deepseek-flash into its high-effort reasoning mode on free tier.
export function getProviderOptionsForTier(tier: Tier): ProviderMetadata | undefined {
  return tier === "paid" ? undefined : DEEPSEEK_HIGH_REASONING_OPTIONS
}

// Intake pre-fill and brief resolving are free to the user, so they always
// run on the cheap model regardless of tier, without high-effort reasoning.
export function getCheapModel(): LanguageModelV1 {
  return env.DEEPSEEK_API_KEY ? getDeepseekModel() : getModel("claude-haiku-4-5-20251001")
}

// Cheap vision model for media descriptions: DeepSeek flash (vision-capable)
// on the free tier, Haiku on paid. Falls back to Haiku when DeepSeek is unset.
export function getVisionModelForTier(tier: Tier): LanguageModelV1 {
  return tier === "free" ? getCheapModel() : getModel("claude-haiku-4-5-20251001")
}
