import { generateText, type LanguageModelV1, type ProviderMetadata } from "ai"
import type { ModelId, Tier } from "@repo/schemas"
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

// Errors that mean Claude cannot serve anyone right now (billing, credentials,
// overload), as opposed to a bad request that would fail on any provider.
export function isProviderOutage(err: unknown): boolean {
  const e = err as { statusCode?: number; message?: string; responseBody?: string } | null
  if (e?.statusCode && [401, 402, 403, 529].includes(e.statusCode)) return true
  return /credit balance|billing|insufficient.*(credit|quota)|overloaded|invalid x-api-key|authentication_error|permission_error/i.test(
    `${e?.message ?? ""} ${e?.responseBody ?? ""}`,
  )
}

const PROBE_TTL_MS = 5 * 60_000
const PROBE_TIMEOUT_MS = 10_000
let claudeProbe: { at: number; ok: Promise<boolean> } | null = null

export type ClaudeProbe = () => Promise<void>

const probeClaude: ClaudeProbe = async () => {
  await generateText({ model: getClaudeModel(), prompt: "ok", maxTokens: 1, abortSignal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
}

// One cached 1-token call answers "is Claude usable?" for every paid request
// in the next few minutes; only an outage (not a slow or odd reply) says no.
export type ProbeOptions = { probe?: ClaudeProbe; now?: number; hasFallback?: boolean }

export async function claudeAvailable({ probe = probeClaude, now = Date.now(), hasFallback = !!env.DEEPSEEK_API_KEY }: ProbeOptions = {}): Promise<boolean> {
  if (!hasFallback) return true
  if (claudeProbe && now - claudeProbe.at < PROBE_TTL_MS) return claudeProbe.ok
  const ok = probe().then(
    () => true,
    (err: unknown) => {
      if (!isProviderOutage(err)) return true
      console.warn(`[llm] Claude unavailable (${(err as Error)?.message?.slice(0, 120)}); paid requests use DeepSeek until it recovers`)
      return false
    },
  )
  claudeProbe = { at: now, ok }
  return ok
}

export function resetClaudeProbe(): void {
  claudeProbe = null
}

export type TierModel = { model: LanguageModelV1; providerOptions: ProviderMetadata | undefined; failover: boolean }

// The paid tier's model when Claude is usable, otherwise DeepSeek with the
// free tier's settings, so a Claude outage degrades quality instead of
// failing requests the user has already paid for.
export async function resolveTierModel(tier: Tier, options?: ProbeOptions): Promise<TierModel> {
  if (tier === "paid" && !(await claudeAvailable(options))) {
    return { model: getDeepseekModel(), providerOptions: DEEPSEEK_HIGH_REASONING_OPTIONS, failover: true }
  }
  return { model: getModelForTier(tier), providerOptions: getProviderOptionsForTier(tier), failover: false }
}

// Same rule for flows that pick a model by id (iteration, chat edits).
export async function resolveModelById(modelId?: ModelId): Promise<LanguageModelV1> {
  const model = getModel(modelId)
  return model.provider.startsWith("anthropic") && !(await claudeAvailable()) ? getDeepseekModel() : model
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
