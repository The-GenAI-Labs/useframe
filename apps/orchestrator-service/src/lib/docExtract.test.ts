import { describe, expect, it } from "vitest"
import { deflateRawSync } from "node:zlib"
import { extractText } from "./docExtract.child.js"

function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name)
    const data = deflateRawSync(Buffer.from(content))
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    locals.push(local, nameBuf, data)
    centrals.push(central, nameBuf)
    offset += 30 + nameBuf.length + data.length
  }
  const cd = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(files).length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

describe("document text extraction", () => {
  it("reads docx paragraphs as text only", async () => {
    const doc = zip({
      "word/document.xml": `<w:document><w:body><w:p><w:r><w:t>Ledgerly &amp; books</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">For freelancers</w:t></w:r></w:p></w:body></w:document>`,
      "word/_rels/document.xml.rels": `<Relationship Target="http://169.254.169.254/" TargetMode="External"/>`,
    })
    const text = await extractText({ kind: "docx", data: doc, maxChars: 1000 })
    expect(text).toContain("Ledgerly & books")
    expect(text).toContain("For freelancers")
    expect(text).not.toContain("169.254")
  })

  it("reads pptx slides in order and caps length", async () => {
    const deck = zip({
      "ppt/slides/slide2.xml": `<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>`,
      "ppt/slides/slide1.xml": `<p:sld><a:p><a:r><a:t>First</a:t></a:r></a:p></p:sld>`,
    })
    const text = await extractText({ kind: "pptx", data: deck, maxChars: 1000 })
    expect(text.indexOf("First")).toBeLessThan(text.indexOf("Second"))
    expect((await extractText({ kind: "txt", data: Buffer.from("x".repeat(500)), maxChars: 100 })).length).toBe(100)
  })

  it("refuses inflation bombs instead of expanding them", async () => {
    const bomb = zip({ "word/document.xml": "a".repeat(20 * 1024 * 1024) })
    await expect(extractText({ kind: "docx", data: bomb, maxChars: 1000 })).rejects.toThrow()
  })
})
