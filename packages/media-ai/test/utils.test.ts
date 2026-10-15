import { describe, expect, it } from "vitest"
import { estimateJobCost, itemCredits, maxCreditsForBudget } from "../src/cost.js"
import { IMAGE_MIN_PIXELS, isValidImageSize, nearestStandardSize, requestSizeFor, stillSize, videoFrameSize } from "../src/frames.js"
import { briefHash, requestKey, uuidFromKey } from "../src/hash.js"
import { costItems } from "../src/jobs.js"
import { lintPrompt } from "../src/lint.js"
import { offPaletteColors } from "../src/palette.js"
import { config, item, PALETTE, pages, video } from "./helpers.js"

const vs = {
  lighting: "soft window light",
  lens: "50mm",
  texture: "matte paper",
  compositionRules: ["one subject"],
  recurringMotif: "paper planes",
  colorUsage: "blue #2563eb on hero objects, orange accents",
  doNot: ["no neon green #00ff00"],
}

describe("palette", () => {
  it("allows palette colours, near matches and neutrals", () => {
    expect(offPaletteColors(vs, PALETTE)).toEqual([])
    expect(offPaletteColors({ ...vs, texture: "white paper on #2665ea and black ink" }, PALETTE)).toEqual([])
  })

  it("rejects colours outside the palette but ignores the doNot list", () => {
    expect(offPaletteColors({ ...vs, colorUsage: "magenta #ff00ff glow" }, PALETTE).length).toBeGreaterThan(0)
  })
})

describe("frames", () => {
  it("uses the video provider's frame sizes", () => {
    expect(videoFrameSize("16:9")).toEqual({ width: 1344, height: 768 })
    expect(videoFrameSize("9:16")).toEqual({ width: 768, height: 1344 })
  })

  it("scales small targets up to the image model's minimum pixel count", () => {
    const size = requestSizeFor({ width: 768, height: 768 })
    expect(size.width * size.height).toBeGreaterThanOrEqual(IMAGE_MIN_PIXELS)
    expect(isValidImageSize(size)).toBe(true)
  })

  it("produces valid still and standard sizes", () => {
    for (const aspect of ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const) {
      const s = stillSize(aspect)
      expect(s.width % 16).toBe(0)
      expect(s.height % 16).toBe(0)
      expect(isValidImageSize(nearestStandardSize(s))).toBe(true)
    }
  })
})

describe("cost", () => {
  it("prices an image, a video and the blueprint call", () => {
    const [img, vid] = costItems([item(), video({ slotId: "home/cta-3/background" })])
    expect(itemCredits(img!, config)).toBe(config.credits.image)
    expect(itemCredits(vid!, config)).toBe(2 * config.credits.image + 6 * config.credits.videoPerSecond)
    const est = estimateJobCost([img!, vid!], config, { blueprint: true })
    expect(est.credits).toBe(itemCredits(img!, config) + itemCredits(vid!, config) + config.credits.blueprint)
    expect(est.perItem.blueprint).toBe(config.credits.blueprint)
  })

  it("does not charge for uploaded media", () => {
    expect(itemCredits(costItems([item({ decision: "USE_UPLOADED", assetId: "a1" })])[0]!, config)).toBe(0)
  })

  it("bounds the cost of a budget tier", () => {
    const max = maxCreditsForBudget({ maxImages: 4, maxVideos: 1 }, config, { blueprint: true })
    expect(max).toBeGreaterThanOrEqual(estimateJobCost(costItems([item(), video({ slotId: "home/cta-3/background" })]), config, { blueprint: true }).credits)
  })
})

describe("hash", () => {
  it("only depends on section order and copy framework", () => {
    const a = pages()
    const b = pages()
    b[0]!.sections[0]!.content.headline = "Different words"
    expect(briefHash(a, "AIDA")).toBe(briefHash(b, "AIDA"))
    expect(briefHash(a, "AIDA")).not.toBe(briefHash(a, "PAS"))
  })

  it("derives stable request keys and task ids", () => {
    const key = requestKey("job", "VIDEO", "vid-1", 1)
    expect(key).toBe(requestKey("job", "VIDEO", "vid-1", 1))
    expect(key).not.toBe(requestKey("job", "VIDEO", "vid-1", 2))
    expect(uuidFromKey(key)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe("lintPrompt", () => {
  it("catches contact details, style imitation, unsafe and forbidden terms", () => {
    expect(lintPrompt("A calm desk, soft light, no text")).toEqual([])
    const issues = lintPrompt("Email me at a@b.co or +1 415 555 0100, in the style of a famous painter, with a gun, for Ledgerly", ["Ledgerly"])
    expect(issues).toHaveLength(5)
  })
})
