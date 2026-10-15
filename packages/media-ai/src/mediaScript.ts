import type { SiteSpec } from "@repo/schemas"
import {
  checkBinding,
  isUploadOnlyPurpose,
  listMediaSlots,
  type BindableAsset,
  type MediaSlotDef,
  type SlotRef,
} from "@repo/site-builder"
import { PLANNING_ITEM_SLOTS } from "./constants.js"
import type { Budget, MediaAiConfig } from "./config.js"
import { MediaItemSchema, type MediaItem } from "./schemas.js"

type Pages = SiteSpec["pages"]

// Sections that get item slots but have no items yet (the copy agent writes
// them later) are planned against PLANNING_ITEM_SLOTS provisional items.
export function planningSlots(pages: Pages): SlotRef[] {
  const padded = pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) =>
      (section.content?.items?.length ?? 0) > 0
        ? section
        : {
            ...section,
            content: {
              ...section.content,
              items: Array.from({ length: PLANNING_ITEM_SLOTS }, () => ({ title: "", description: "" })),
            },
          },
    ),
  }))
  const real = new Map(pages.flatMap((p) => p.sections.map((s) => [`${p.slug}/${s.type}-${s.index}`, s])))
  return listMediaSlots({ pages: padded }).map((ref) => ({
    ...ref,
    section: real.get(`${ref.pageSlug}/${ref.section.type}-${ref.section.index}`) ?? ref.section,
  }))
}

export type MediaScriptContext = {
  pages: Pages
  uploaded: ReadonlyMap<string, BindableAsset>
  budget: Budget
  config: Pick<MediaAiConfig, "videoMinSeconds" | "videoMaxSeconds" | "maxAutoplayVideosPerPage">
  // How many more generated assets this project may still get.
  generatedAllowance?: number
}

export type MediaScriptResult = {
  items: MediaItem[]
  errors: string[]
  dropped: { itemId: string; reason: string }[]
}

function slotAspectFits(slot: MediaSlotDef, item: MediaItem): MediaItem {
  if (slot.display === "background") return { ...item, display: "background" }
  return { ...item, display: "inline", aspect: slot.aspect ?? item.aspect }
}

export function validateMediaScript(raw: readonly unknown[], ctx: MediaScriptContext): MediaScriptResult {
  const errors: string[] = []
  const dropped: { itemId: string; reason: string }[] = []
  const slots = new Map(planningSlots(ctx.pages).map((ref) => [ref.slotId, ref]))
  const seenIds = new Set<string>()
  const candidates: MediaItem[] = []

  raw.forEach((entry, i) => {
    const parsed = MediaItemSchema.safeParse(entry)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      errors.push(`mediaScript[${i}]: ${issue?.path.join(".") || "item"} ${issue?.message ?? "is invalid"}`)
      return
    }
    let item = parsed.data
    const where = `mediaScript[${i}] (${item.itemId})`
    if (seenIds.has(item.itemId)) return void errors.push(`${where}: duplicate itemId`)
    seenIds.add(item.itemId)

    const ref = slots.get(item.slotId)
    if (!ref) return void errors.push(`${where}: slot "${item.slotId}" does not exist in the chosen sections`)
    const slot = ref.slot
    if (!slot.kinds.includes(item.kind)) return void errors.push(`${where}: slot "${item.slotId}" does not accept ${item.kind}`)

    if (item.decision === "GENERATE") {
      if (isUploadOnlyPurpose(slot.purpose)) {
        return void errors.push(`${where}: slot purpose "${slot.purpose}" is upload-only and cannot be generated`)
      }
      if (item.assetId) item = { ...item, assetId: undefined }
    } else {
      const asset = item.assetId ? ctx.uploaded.get(item.assetId) : undefined
      if (!asset) return void errors.push(`${where}: assetId is not in the uploaded-asset menu`)
      const reason = checkBinding(slot, asset)
      if (reason) return void errors.push(`${where}: uploaded asset does not fit: ${reason}`)
      if ((asset.kind === "VIDEO" ? "video" : "image") !== item.kind) {
        return void errors.push(`${where}: kind does not match the uploaded asset`)
      }
    }

    for (const refId of item.referenceAssetIds ?? []) {
      const asset = ctx.uploaded.get(refId)
      if (!asset || asset.kind !== "IMAGE") return void errors.push(`${where}: reference asset ${refId} is not an uploaded image`)
    }

    if (item.kind === "video") {
      if (!item.video) return void errors.push(`${where}: video items need a video section`)
      const durationSec = Math.round(
        Math.min(ctx.config.videoMaxSeconds, Math.max(ctx.config.videoMinSeconds, item.video.durationSec)),
      )
      item = { ...item, video: { ...item.video, durationSec } }
    } else if (item.video) {
      item = { ...item, video: undefined }
    }

    candidates.push(slotAspectFits(slot, item))
  })

  // One item per slot; an uploaded asset wins over a generated one.
  const bySlot = new Map<string, MediaItem>()
  for (const item of candidates) {
    const current = bySlot.get(item.slotId)
    if (!current) bySlot.set(item.slotId, item)
    else if (current.decision === "GENERATE" && item.decision === "USE_UPLOADED") {
      errors.push(`${current.itemId}: slot "${item.slotId}" already used by ${item.itemId}`)
      bySlot.set(item.slotId, item)
    } else {
      errors.push(`${item.itemId}: slot "${item.slotId}" already used by ${current.itemId}`)
    }
  }
  let items = [...bySlot.values()]

  // Budget, hard caps and autoplay limits trim by priority (highest number first).
  const drop = (victims: MediaItem[], reason: string) => {
    const ids = new Set(victims.map((v) => v.itemId))
    for (const v of victims) dropped.push({ itemId: v.itemId, reason })
    items = items.filter((i) => !ids.has(i.itemId))
  }
  const byPriority = (a: MediaItem, b: MediaItem) => b.priority - a.priority
  const generated = (kind: "image" | "video") => items.filter((i) => i.decision === "GENERATE" && i.kind === kind)

  const overImages = generated("image").length - ctx.budget.maxImages
  if (overImages > 0) drop(generated("image").sort(byPriority).slice(0, overImages), "over the image budget")
  const overVideos = generated("video").length - ctx.budget.maxVideos
  if (overVideos > 0) drop(generated("video").sort(byPriority).slice(0, overVideos), "over the video budget")

  if (ctx.generatedAllowance !== undefined) {
    const all = items.filter((i) => i.decision === "GENERATE")
    const over = all.length - Math.max(0, ctx.generatedAllowance)
    if (over > 0) drop(all.sort(byPriority).slice(0, over), "project generated-asset limit reached")
  }

  const pages = new Set(items.map((i) => slots.get(i.slotId)!.pageSlug))
  for (const page of pages) {
    const videos = items.filter((i) => i.kind === "video" && slots.get(i.slotId)!.pageSlug === page)
    const over = videos.length - ctx.config.maxAutoplayVideosPerPage
    if (over > 0) drop(videos.sort(byPriority).slice(0, over), "too many autoplaying videos on one page")
  }

  return { items, errors, dropped }
}
