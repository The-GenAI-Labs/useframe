import type { Checkpoint } from "./constants.js"
import type { Concept, JudgeOutput, MediaItem } from "./schemas.js"

export const ITEM_STAGES = ["CONCEPTS", "SELECT", "FRAMES", "IMG_QA", "VIDEO_PROMPT", "VIDEO", "VID_QA"] as const
export type ItemStage = (typeof ITEM_STAGES)[number]

export type ItemStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED" | "DROPPED" | "SKIPPED"

export type ConceptOutput = {
  concepts: Concept[]
  judge: JudgeOutput
  ranked: { id: Concept["id"]; score: number }[]
  recommendedId: Concept["id"]
  chosenId: Concept["id"]
  directorNotes: string[]
  regenerations: number
}

export type FrameOutput = {
  openingPrompt: string
  endingPrompt?: string
  openingAssetId: string
  endingAssetId?: string
  attempts: number
  altText?: string
}

export type VideoOutput = {
  mode: "FIRST_AND_LAST" | "FIRST_ONLY"
  durationSec: number
  prompt: string
  loop: boolean
  candidateAssetIds: string[]
  chosenAssetId?: string
  attempts: number
  qa?: Record<string, { pass: boolean; notes: string }>
}

export type ItemState = {
  item: MediaItem
  status: ItemStatus
  // Stages whose output is persisted; a resumed run starts after the last one.
  done: ItemStage[]
  concept?: ConceptOutput
  frames?: FrameOutput
  // Plain image items keep their result here.
  image?: { prompt: string; assetId: string; attempts: number; altText?: string }
  video?: VideoOutput
  // Asset bound in the slot when a video failed but the still frame fits.
  fallbackAssetId?: string
  imagePrompt?: string
  overlay?: "none" | "light" | "dark"
  note?: string
  candidates?: number
  failureReason?: string
}

export type JobState = {
  approved: Checkpoint[]
  // Credits reserved per item id ("blueprint", item ids, regeneration ids).
  charges: Record<string, number>
  settled: Record<string, "kept" | "refunded">
  items: Record<string, ItemState>
  blueprintDone?: boolean
  expanded?: boolean
  bound?: boolean
}

export function emptyJobState(): JobState {
  return { approved: [], charges: {}, settled: {}, items: {} }
}

export function readJobState(value: unknown): JobState {
  const v = (value && typeof value === "object" ? value : {}) as Partial<JobState>
  return {
    approved: v.approved ?? [],
    charges: v.charges ?? {},
    settled: v.settled ?? {},
    items: v.items ?? {},
    ...(v.blueprintDone ? { blueprintDone: true } : {}),
    ...(v.expanded ? { expanded: true } : {}),
    ...(v.bound ? { bound: true } : {}),
  }
}

export type MediaBindingOut = { assetId: string; loop?: boolean; playWhen?: "load" | "in_view"; overlay?: "none" | "light" | "dark" }
