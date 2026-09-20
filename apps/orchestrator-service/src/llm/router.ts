import type { LanguageModelV1 } from "ai"
import type { Tier } from "@repo/schemas"
import { getClaudeModel, getDeepseekModel } from "./providers.js"

export type { Tier }

// Free tier runs on DeepSeek (cheap, no credit cost to the user). Paid tier
// runs on Claude. This is the single place generation-quality model choice
// is made based on tier — callers should never call getClaudeModel/
// getDeepseekModel directly for tier-gated flows.
export function getModelForTier(tier: Tier): LanguageModelV1 {
  return tier === "paid" ? getClaudeModel() : getDeepseekModel()
}
