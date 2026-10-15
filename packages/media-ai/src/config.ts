import { MEDIA_BUDGET_TIERS, type MediaBudgetTier } from "./constants.js"

export type Budget = { maxImages: number; maxVideos: number }

export type MediaAiConfig = {
  enabled: boolean
  budgets: Record<MediaBudgetTier, Budget>
  hardMaxImages: number
  hardMaxVideos: number
  hardMaxGeneratedAssets: number
  maxAutoplayVideosPerPage: number
  videoMinSeconds: number
  videoMaxSeconds: number
  dailyCostCapUsd: number | null
  credits: { image: number; videoPerSecond: number; blueprint: number }
  // Estimates used when a provider does not report cost, and for the circuit breaker.
  providerCostUsd: { image: number; videoPerSecond: number; llmCall: number; blueprint: number }
}

type Env = Record<string, string | undefined>

const DEFAULT_BUDGETS: Record<MediaBudgetTier, string> = {
  IMAGES_ONLY: "8:0",
  LIGHT: "4:1",
  STANDARD: "8:3",
  RICH: "14:6",
}

export function parseBudget(value: string): Budget {
  const match = /^\s*(\d{1,3})\s*:\s*(\d{1,3})\s*$/.exec(value)
  if (!match) throw new Error(`Invalid media budget "${value}", expected images:videos`)
  return { maxImages: Number(match[1]), maxVideos: Number(match[2]) }
}

const num = (env: Env, name: string, fallback: number): number => {
  const raw = env[name]
  if (raw === undefined || raw === "") return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`)
  return value
}

const price = (env: Env, name: string, production: boolean): number => {
  const raw = env[name]
  if (raw === undefined || raw === "") {
    if (production) throw new Error(`${name} is required in production`)
    return 1
  }
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a whole number of credits`)
  return value
}

export function loadMediaAiConfig(env: Env): MediaAiConfig {
  const production = env.NODE_ENV === "production"
  const enabled = env.MEDIA_ENABLED === "true"
  const budgets = Object.fromEntries(
    MEDIA_BUDGET_TIERS.map((tier) => [tier, parseBudget(env[`MEDIA_BUDGET_${tier}`] || DEFAULT_BUDGETS[tier])]),
  ) as Record<MediaBudgetTier, Budget>
  const videoMinSeconds = Math.max(5, num(env, "VIDEO_MIN_SECONDS", 5))
  const videoMaxSeconds = Math.min(15, Math.max(videoMinSeconds, num(env, "VIDEO_MAX_SECONDS", 10)))
  const cap = env.MEDIA_DAILY_COST_CAP_USD
  return {
    enabled,
    budgets,
    hardMaxImages: num(env, "MEDIA_HARD_MAX_IMAGES", 24),
    hardMaxVideos: num(env, "MEDIA_HARD_MAX_VIDEOS", 10),
    hardMaxGeneratedAssets: num(env, "MEDIA_HARD_MAX_GENERATED_ASSETS", 60),
    maxAutoplayVideosPerPage: num(env, "MEDIA_MAX_AUTOPLAY_VIDEOS_PER_PAGE", 3),
    videoMinSeconds,
    videoMaxSeconds,
    dailyCostCapUsd: cap === undefined || cap === "" ? null : num(env, "MEDIA_DAILY_COST_CAP_USD", 0),
    // Prices only matter once media is on, so a disabled deployment may leave them unset.
    credits: {
      image: price(env, "MEDIA_CREDIT_IMAGE", production && enabled),
      videoPerSecond: price(env, "MEDIA_CREDIT_VIDEO_PER_SECOND", production && enabled),
      blueprint: price(env, "MEDIA_CREDIT_BLUEPRINT", production && enabled),
    },
    providerCostUsd: {
      image: num(env, "MEDIA_COST_IMAGE_USD", 0.25),
      videoPerSecond: num(env, "MEDIA_COST_VIDEO_USD_PER_SECOND", 0.08),
      llmCall: num(env, "MEDIA_COST_LLM_CALL_USD", 0.05),
      blueprint: num(env, "MEDIA_COST_BLUEPRINT_USD", 0.4),
    },
  }
}

export function budgetFor(config: MediaAiConfig, tier: MediaBudgetTier): Budget {
  const b = config.budgets[tier]
  return {
    maxImages: Math.min(b.maxImages, config.hardMaxImages),
    maxVideos: tier === "IMAGES_ONLY" ? 0 : Math.min(b.maxVideos, config.hardMaxVideos),
  }
}
