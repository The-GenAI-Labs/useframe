import { describe, expect, it } from "vitest"
import { planningSlots, validateMediaScript, type MediaScriptContext } from "../src/mediaScript.js"
import { config, item, pages, video } from "./helpers.js"

const ctx = (overrides: Partial<MediaScriptContext> = {}): MediaScriptContext => ({
  pages: pages(),
  uploaded: new Map(),
  budget: { maxImages: 8, maxVideos: 3 },
  config,
  ...overrides,
})

describe("planningSlots", () => {
  it("pads sections without items with provisional item slots", () => {
    const ids = planningSlots(pages()).map((r) => r.slotId)
    expect(ids).toContain("home/how_it_works-2/item-2")
    expect(ids).not.toContain("home/how_it_works-2/item-3")
    expect(ids).toContain("home/features-1/item-2")
  })
})

describe("validateMediaScript", () => {
  it("rejects an item that points at a missing section", () => {
    const res = validateMediaScript([item({ slotId: "home/pricing-9/background" })], ctx())
    expect(res.items).toHaveLength(0)
    expect(res.errors[0]).toMatch(/does not exist/)
  })

  it("rejects duplicate item ids and unknown uploaded assets", () => {
    const res = validateMediaScript(
      [
        item(),
        item({ slotId: "home/cta-3/background" }),
        item({ itemId: "up-1", decision: "USE_UPLOADED", assetId: "nope", slotId: "home/features-1/item-0" }),
      ],
      ctx(),
    )
    expect(res.errors.join("\n")).toMatch(/duplicate itemId/)
    expect(res.errors.join("\n")).toMatch(/not in the uploaded-asset menu/)
  })

  it("clamps video durations and normalises the display to the slot", () => {
    const res = validateMediaScript(
      [video({ video: { durationSec: 40, loopable: false, motionIntent: "glide", playWhen: "load" }, display: "inline" })],
      ctx(),
    )
    expect(res.items[0]!.video!.durationSec).toBe(config.videoMaxSeconds)
    expect(res.items[0]!.display).toBe("background")
  })

  it("trims over-budget items by highest priority number first", () => {
    const res = validateMediaScript(
      [
        item({ itemId: "a", slotId: "home/hero-0/background", priority: 1 }),
        item({ itemId: "b", slotId: "home/features-1/item-0", priority: 5, display: "inline" }),
        item({ itemId: "c", slotId: "home/features-1/item-1", priority: 3, display: "inline" }),
      ],
      ctx({ budget: { maxImages: 2, maxVideos: 0 } }),
    )
    expect(res.items.map((i) => i.itemId).sort()).toEqual(["a", "c"])
    expect(res.dropped).toEqual([{ itemId: "b", reason: "over the image budget" }])
  })

  it("caps autoplaying videos per page", () => {
    const res = validateMediaScript(
      [
        video({ itemId: "v1", slotId: "home/hero-0/background", priority: 1 }),
        video({ itemId: "v2", slotId: "home/features-1/item-0", priority: 2 }),
        video({ itemId: "v3", slotId: "home/cta-3/background", priority: 3 }),
      ],
      ctx({ config: { ...config, maxAutoplayVideosPerPage: 2 } }),
    )
    expect(res.items.map((i) => i.itemId)).not.toContain("v3")
    expect(res.dropped[0]!.reason).toMatch(/autoplaying/)
  })
})
