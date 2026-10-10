import { deflateSync, crc32 } from "node:zlib"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import sharp from "sharp"
import { beforeEach, describe, expect, it } from "vitest"
import { MediaRejectedError } from "@/processing/errors.js"
import { processImage } from "@/processing/image.js"

let dir = ""
const limits = { maxInputPixels: 60_000_000 }

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "media-img-"))
})

async function fixture(name: string, data: Buffer): Promise<string> {
  const file = path.join(dir, name)
  await writeFile(file, data)
  return file
}

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// A valid PNG header that claims 30000x30000 pixels, with almost no data behind it.
function pngBomb(): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(30_000, 0)
  ihdr.writeUInt32BE(30_000, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(64))),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

describe("processImage", () => {
  it("strips EXIF/GPS metadata from every variant and auto-orients", async () => {
    const input = await photo(2000, 1000)
      .withExif({
        IFD0: { Make: "SpyCam", Copyright: "secret" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" },
      })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()
    expect((await sharp(input).metadata()).exif).toBeDefined()
    const out = await processImage(await fixture("orig", input), dir, limits)
    // Orientation 6 means "rotate 90°", so the stored landscape becomes portrait.
    expect([out.width, out.height]).toEqual([1000, 2000])
    for (const v of out.variants) {
      const meta = await sharp(v.path).metadata()
      expect(meta.exif, v.role).toBeUndefined()
      expect(meta.xmp, v.role).toBeUndefined()
      expect(meta.orientation ?? 1, v.role).toBe(1)
      const bytes = await readFile(v.path)
      expect(bytes.includes(Buffer.from("SpyCam")), v.role).toBe(false)
    }
  })

  it("produces WebP widths, a JPEG fallback, a thumb, LQIP and a dominant colour without upscaling", async () => {
    const out = await processImage(await fixture("orig", await photo(1700, 900).png().toBuffer()), dir, limits)
    expect(out.variants.map((v) => v.role)).toEqual(["w480", "w960", "w1600", "fallback", "thumb"])
    expect(out.variants.find((v) => v.role === "w1600")).toMatchObject({ mime: "image/webp", width: 1600 })
    expect(out.variants.find((v) => v.role === "fallback")).toMatchObject({ mime: "image/jpeg", width: 1600 })
    expect(out.dominantColor).toMatch(/^#[0-9a-f]{6}$/)
    expect(out.lqip).toMatch(/^data:image\/webp;base64,/)
    expect(out.lqip!.length).toBeLessThanOrEqual(1536)
    for (const v of out.variants) expect(v.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(out.describeImage).toBe(out.variants.find((v) => v.role === "w960")!.path)
  })

  it("adds w2400 only for sources at least 2400 px wide", async () => {
    const out = await processImage(await fixture("orig", await photo(2600, 1300).jpeg().toBuffer()), dir, limits)
    expect(out.variants.find((v) => v.role === "w2400")?.width).toBe(2400)
  })

  it("never upscales a tiny image", async () => {
    const out = await processImage(await fixture("orig", await photo(120, 60).png().toBuffer()), dir, limits)
    expect(out.variants.map((v) => [v.role, v.width])).toEqual([
      ["w480", 120],
      ["fallback", 120],
      ["thumb", 120],
    ])
  })

  it("keeps alpha in WebP and flattens the JPEG fallback", async () => {
    const png = await sharp({
      create: { width: 600, height: 400, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.3 } },
    })
      .png()
      .toBuffer()
    const out = await processImage(await fixture("orig", png), dir, limits)
    expect((await sharp(out.variants.find((v) => v.role === "w480")!.path).metadata()).hasAlpha).toBe(true)
    expect((await sharp(out.variants.find((v) => v.role === "fallback")!.path).metadata()).hasAlpha).toBe(false)
  })

  it("rejects a 30000x30000 decompression bomb by its pixel count", async () => {
    await expect(processImage(await fixture("orig", pngBomb()), dir, limits)).rejects.toMatchObject({
      publicReason: "This image is too large to process",
    })
  })

  it("rejects SVG renamed to .png, GIF and garbage", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
    )
    await expect(processImage(await fixture("logo.png", svg), dir, limits)).rejects.toBeInstanceOf(MediaRejectedError)
    const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } })
      .gif()
      .toBuffer()
    await expect(processImage(await fixture("a.gif", gif), dir, limits)).rejects.toMatchObject({
      publicReason: "Couldn't read this image",
    })
    await expect(processImage(await fixture("junk", Buffer.from("not an image")), dir, limits)).rejects.toBeInstanceOf(
      MediaRejectedError,
    )
  })

  it("decodes a JPEG with HTML appended and emits clean variants", async () => {
    const polyglot = Buffer.concat([
      await photo(800, 600).jpeg().toBuffer(),
      Buffer.from("<html><script>alert(1)</script></html>"),
    ])
    const out = await processImage(await fixture("orig", polyglot), dir, limits)
    for (const v of out.variants) expect((await readFile(v.path)).includes(Buffer.from("<script>"))).toBe(false)
  })

  it("rejects a truncated image", async () => {
    const jpeg = await photo(800, 600).jpeg().toBuffer()
    await expect(
      processImage(await fixture("orig", jpeg.subarray(0, jpeg.length / 2)), dir, limits),
    ).rejects.toMatchObject({
      publicReason: "Couldn't read this image",
    })
  })
})
