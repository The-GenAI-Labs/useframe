export const MECHANISMS = [
  "SCALE_SHIFT",
  "MATERIAL_TRANSFORM",
  "VISUAL_METAPHOR",
  "IMPOSSIBLE_PHYSICS",
  "SURPRISING_REVEAL",
  "MACRO_JOURNEY",
  "TIME_LAPSE_TRANSFORM",
  "PARALLAX_WORLD",
] as const
export type Mechanism = (typeof MECHANISMS)[number]

export const MECHANISM_LABELS: Record<Mechanism, string> = {
  SCALE_SHIFT: "Change of scale",
  MATERIAL_TRANSFORM: "Material transformation",
  VISUAL_METAPHOR: "Visual metaphor",
  IMPOSSIBLE_PHYSICS: "Impossible physics",
  SURPRISING_REVEAL: "Surprising reveal",
  MACRO_JOURNEY: "Macro journey",
  TIME_LAPSE_TRANSFORM: "Time-lapse transformation",
  PARALLAX_WORLD: "Parallax world",
}

// Extend freely; matching is case-insensitive substring.
export const CLICHES = [
  "glowing particles",
  "abstract swirling gradient",
  "neon grid",
  "futuristic cityscape of light",
  "floating ui cards",
  "blue digital globe",
  "brain made of circuits",
  "handshake",
  "lightbulb moment",
  "rocket launch",
  "stock office team",
  "binary rain",
  "holographic dashboard",
] as const

export const ASPECTS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const
export type Aspect = (typeof ASPECTS)[number]

// The provider's 768p canvases (Runware, MiniMax H3 Max).
export const VIDEO_FRAME_SIZES: Record<Aspect, { width: number; height: number }> = {
  "16:9": { width: 1344, height: 768 },
  "4:3": { width: 1024, height: 768 },
  "1:1": { width: 768, height: 768 },
  "3:4": { width: 768, height: 1024 },
  "9:16": { width: 768, height: 1344 },
  "21:9": { width: 1536, height: 672 },
}

export const CHECKPOINTS = ["PLAN_APPROVE", "CONCEPT_PICK", "IMAGES_APPROVE", "VIDEO_APPROVE"] as const
export type Checkpoint = (typeof CHECKPOINTS)[number]

export const CHECKPOINT_TTL_MS = 72 * 60 * 60 * 1000

export const MEDIA_MODES = ["AUTO", "MANUAL", "OFF"] as const
export type MediaMode = (typeof MEDIA_MODES)[number]

export const MEDIA_BUDGET_TIERS = ["IMAGES_ONLY", "LIGHT", "STANDARD", "RICH"] as const
export type MediaBudgetTier = (typeof MEDIA_BUDGET_TIERS)[number]

export const ROUTING_KEYS = ["blueprint", "media-creative", "media-vision"] as const
export type RoutingKey = (typeof ROUTING_KEYS)[number]

// Item sections (feature tiles, steps) get their slots once the copy agent has
// written items; the blueprint plans against this many provisional ones.
export const PLANNING_ITEM_SLOTS = 3

export const SUBSTEPS = [
  "blueprint",
  "media.expand",
  "media.concepts",
  "media.select",
  "media.frames",
  "media.images",
  "media.video",
  "media.qa",
  "media.bind",
  "media.awaiting_user",
] as const
export type Substep = (typeof SUBSTEPS)[number]

export const SUBSTEP_LABELS: Record<Substep, string> = {
  blueprint: "Writing your site's full script",
  "media.expand": "Planning your images and videos",
  "media.concepts": "Imagining ideas for your videos",
  "media.select": "Choosing the strongest ideas",
  "media.frames": "Creating your scenes",
  "media.images": "Creating your images",
  "media.video": "Animating them",
  "media.qa": "Checking every frame",
  "media.bind": "Placing them on your site",
  "media.awaiting_user": "Waiting for your approval",
}
