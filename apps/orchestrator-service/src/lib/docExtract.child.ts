import { inflateRawSync } from "node:zlib"

// Runs in a forked child process (see docExtract.ts) so a hostile or
// pathological file can only hang or crash this process, which the parent
// kills on timeout. Text only: no macros, no external references, no
// embedded objects are ever followed.

export type DocKind = "pdf" | "docx" | "pptx" | "txt" | "md"
export type ExtractRequest = { kind: DocKind; data: Uint8Array; maxChars: number }
export type ExtractResponse = { ok: true; text: string } | { ok: false; error: string }

const MAX_PDF_PAGES = 40
const MAX_SLIDES = 60
const MAX_ZIP_ENTRIES = 5000
const MAX_ENTRY_BYTES = 8 * 1024 * 1024

type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number }

function zipEntries(buf: Buffer): ZipEntry[] {
  const minEocd = Math.max(0, buf.length - 65_557)
  let eocd = -1
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error("not a zip")
  const count = buf.readUInt16LE(eocd + 10)
  let offset = buf.readUInt32LE(eocd + 16)
  if (count > MAX_ZIP_ENTRIES) throw new Error("too many entries")

  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) break
    const method = buf.readUInt16LE(offset + 10)
    const compressedSize = buf.readUInt32LE(offset + 20)
    const nameLen = buf.readUInt16LE(offset + 28)
    const extraLen = buf.readUInt16LE(offset + 30)
    const commentLen = buf.readUInt16LE(offset + 32)
    const localOffset = buf.readUInt32LE(offset + 42)
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen)
    entries.push({ name, method, compressedSize, localOffset })
    offset += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function readEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const at = entry.localOffset
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== 0x04034b50) throw new Error("bad entry")
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28)
  const data = buf.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return data.subarray(0, MAX_ENTRY_BYTES)
  if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES })
  throw new Error("unsupported compression")
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n)
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ""
    })
    .replace(/&amp;/g, "&")
}

function xmlRuns(xml: string, paragraphTag: string, textTag: string): string {
  return decodeXml(
    xml
      .replace(new RegExp(`</${paragraphTag}>`, "g"), "\n")
      .replace(/<w:tab\/>|<w:br\/>|<a:br\/>/g, " ")
      .replace(new RegExp(`<(?!/?${textTag}[ >])[^>]*>`, "g"), "")
      .replace(new RegExp(`</?${textTag}[^>]*>`, "g"), ""),
  )
}

function extractDocx(buf: Buffer): string {
  const entry = zipEntries(buf).find((e) => e.name === "word/document.xml")
  if (!entry) throw new Error("not a docx")
  return xmlRuns(readEntry(buf, entry).toString("utf8"), "w:p", "w:t")
}

function extractPptx(buf: Buffer): string {
  const slides = zipEntries(buf)
    .map((e) => ({ e, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(e.name)?.[1]) }))
    .filter((s) => Number.isFinite(s.n))
    .sort((a, b) => a.n - b.n)
    .slice(0, MAX_SLIDES)
  if (slides.length === 0) throw new Error("not a pptx")
  return slides.map((s, i) => `Slide ${i + 1}: ${xmlRuns(readEntry(buf, s.e).toString("utf8"), "a:p", "a:t")}`).join("\n")
}

async function extractPdf(data: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import("unpdf")
  const pdf = await getDocumentProxy(data, { disableFontFace: true, useSystemFonts: false })
  const pages = Math.min(pdf.numPages, MAX_PDF_PAGES)
  const out: string[] = []
  for (let i = 1; i <= pages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent()
    out.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "))
  }
  return out.join("\n")
}

export async function extractText(req: ExtractRequest): Promise<string> {
  const buf = Buffer.from(req.data)
  let text: string
  switch (req.kind) {
    case "pdf":
      text = await extractPdf(new Uint8Array(buf))
      break
    case "docx":
      text = extractDocx(buf)
      break
    case "pptx":
      text = extractPptx(buf)
      break
    default:
      text = new TextDecoder("utf-8", { fatal: false }).decode(buf)
  }
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, req.maxChars)
}

export const CHILD_ENV_FLAG = "USEFRAME_DOC_EXTRACT_CHILD"

if (process.send && process.env[CHILD_ENV_FLAG] === "1") {
  process.once("message", (msg: ExtractRequest) => {
    extractText(msg)
      .then((text) => process.send!({ ok: true, text } satisfies ExtractResponse))
      .catch((err: unknown) => process.send!({ ok: false, error: err instanceof Error ? err.message : "failed" } satisfies ExtractResponse))
      .finally(() => process.disconnect())
  })
}
