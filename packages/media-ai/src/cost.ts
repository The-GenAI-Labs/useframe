import type { Budget, MediaAiConfig } from "./config.js"

export type CostItem = {
  itemId: string
  kind: "image" | "video"
  decision: "USE_UPLOADED" | "GENERATE"
  durationSec?: number
}

export type JobEstimate = {
  credits: number
  usd: number
  items: { kind: "image" | "video" | "blueprint"; count: number; credits: number }[]
  perItem: Record<string, number>
}

export const BLUEPRINT_ITEM_ID = "blueprint"

// A video item pays for its opening and ending frames plus every second of video.
export function itemCredits(item: CostItem, config: MediaAiConfig): number {
  if (item.decision === "USE_UPLOADED") return 0
  if (item.kind === "image") return config.credits.image
  const seconds = item.durationSec ?? config.videoMaxSeconds
  return 2 * config.credits.image + seconds * config.credits.videoPerSecond
}

function itemUsd(item: CostItem, config: MediaAiConfig): number {
  if (item.decision === "USE_UPLOADED") return 0
  const llm = config.providerCostUsd.llmCall
  if (item.kind === "image") return config.providerCostUsd.image + 2 * llm
  const seconds = item.durationSec ?? config.videoMaxSeconds
  return 2 * config.providerCostUsd.image + seconds * config.providerCostUsd.videoPerSecond + 6 * llm
}

export function estimateJobCost(items: readonly CostItem[], config: MediaAiConfig, opts: { blueprint?: boolean } = {}): JobEstimate {
  const perItem: Record<string, number> = {}
  let credits = 0
  let usd = 0
  const tally = { image: { count: 0, credits: 0 }, video: { count: 0, credits: 0 } }
  for (const item of items) {
    const c = itemCredits(item, config)
    perItem[item.itemId] = c
    credits += c
    usd += itemUsd(item, config)
    if (item.decision === "GENERATE") {
      tally[item.kind].count++
      tally[item.kind].credits += c
    }
  }
  const lines: JobEstimate["items"] = [
    { kind: "image", ...tally.image },
    { kind: "video", ...tally.video },
  ]
  if (opts.blueprint) {
    perItem[BLUEPRINT_ITEM_ID] = config.credits.blueprint
    credits += config.credits.blueprint
    usd += config.providerCostUsd.blueprint
    lines.push({ kind: "blueprint", count: 1, credits: config.credits.blueprint })
  }
  return { credits, usd: Math.round(usd * 100) / 100, items: lines, perItem }
}

// Upper bound for a budget tier, before any plan exists.
export function maxCreditsForBudget(budget: Budget, config: MediaAiConfig, opts: { blueprint?: boolean } = {}): number {
  const items: CostItem[] = [
    ...Array.from({ length: budget.maxImages }, (_, i) => ({ itemId: `i${i}`, kind: "image" as const, decision: "GENERATE" as const })),
    ...Array.from({ length: budget.maxVideos }, (_, i) => ({
      itemId: `v${i}`,
      kind: "video" as const,
      decision: "GENERATE" as const,
      durationSec: config.videoMaxSeconds,
    })),
  ]
  return estimateJobCost(items, config, opts).credits
}
