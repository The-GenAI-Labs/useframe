import type { LanguageModelV1, ProviderMetadata } from "ai"
import type { Tier } from "@repo/schemas"
import { getClaudeModel, getDeepseekModel, DEEPSEEK_HIGH_REASONING_OPTIONS } from "./providers.js"

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
