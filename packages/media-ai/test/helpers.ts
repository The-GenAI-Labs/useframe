import type { SiteSpec } from "@repo/schemas"
import { loadMediaAiConfig } from "../src/config.js"
import type { MediaBrief, MediaItem } from "../src/schemas.js"

export const config = loadMediaAiConfig({ MEDIA_ENABLED: "true" })

type SectionType = SiteSpec["pages"][number]["sections"][number]["type"]

const section = (type: SectionType, index: number, items = 0) => ({
  type,
  index,
  content: {
    headline: `${type} headline`,
    body: "Body",
    items: Array.from({ length: items }, (_, i) => ({ title: `Item ${i}`, description: "Desc" })),
  },
})

export function pages(): SiteSpec["pages"] {
  return [
    {
      type: "HOME",
      slug: "home",
      title: "Home",
      sections: [section("HERO", 0), section("FEATURES", 1, 3), section("HOW_IT_WORKS", 2), section("CTA", 3), section("FOOTER", 4)],
    },
  ] as SiteSpec["pages"]
}

export const PALETTE = ["#2563eb", "#f1f5f9", "#f97316"]

export const mediaBrief: MediaBrief = {
  subject: "Bookkeeping software for small studios",
  audience: { segment: "B2B" },
  message: "Your books, finished without the busywork",
  mood: ["calm"],
  palette: { primary: "#2563eb", secondary: "#f1f5f9", accent: "#f97316", neutrals: [] },
  styleDirection: "Soft natural light, tactile paper objects",
  researchFindingIds: ["f1"],
  avoid: ["readable text"],
  budget: { maxImages: 8, maxVideos: 3 },
  hasProductPhotoUploads: false,
}

export function item(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    itemId: "img-1",
    slotId: "home/hero-0/background",
    kind: "image",
    decision: "GENERATE",
    role: "hook",
    intent: "Make the outcome feel effortless",
    subjectDirection: "A paper plane over a desk",
    mood: ["calm"],
    aspect: "16:9",
    display: "background",
    priority: 1,
    reason: "Sets the tone",
    ...overrides,
  }
}

export function video(overrides: Partial<MediaItem> = {}): MediaItem {
  return item({
    itemId: "vid-1",
    kind: "video",
    video: { durationSec: 6, loopable: true, motionIntent: "slow glide", playWhen: "in_view" },
    ...overrides,
  })
}
