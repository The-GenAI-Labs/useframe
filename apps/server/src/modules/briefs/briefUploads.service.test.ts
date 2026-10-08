import { describe, expect, it, vi } from "vitest"

vi.mock("@useframe/db", () => ({ prisma: {} }))
vi.mock("@/config/env.js", () => ({
  env: { JWT_ACCESS_SECRET: "x".repeat(40), BRIEF_LOGO_MAX_BYTES: 2_097_152, BRIEF_DOC_MAX_BYTES: 10_485_760, BRIEF_DRAFT_TTL_DAYS: 30 },
}))

const { BriefUploadsService, sniffDocument, sniffImage } = await import("./briefUploads.service.js")

describe("upload sniffing", () => {
  it("trusts magic bytes, not names", () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png")
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg")
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull()
    expect(sniffImage(Buffer.from("GIF89a"))).toBeNull()
  })

  it("accepts only real pdf/docx/pptx/txt/md", () => {
    expect(sniffDocument(Buffer.from("%PDF-1.7 ..."), "deck.pdf")).toBe("pdf")
    expect(sniffDocument(Buffer.from("%PDF-1.7 ..."), "deck.docx")).toBeNull()
    expect(sniffDocument(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("word/document.xml")]), "a.docx")).toBe("docx")
    expect(sniffDocument(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("xl/workbook.xml")]), "a.docx")).toBeNull()
    expect(sniffDocument(Buffer.from("# Notes"), "notes.md")).toBe("md")
    expect(sniffDocument(Buffer.from([0x23, 0x00, 0x41]), "notes.txt")).toBeNull()
    expect(sniffDocument(Buffer.from([0xc3, 0x28]), "notes.txt")).toBeNull()
    expect(sniffDocument(Buffer.from("MZ\x90\x00"), "setup.exe")).toBeNull()
  })
})

describe("signed upload URLs", () => {
  it("verifies its own signature and rejects tampering and expiry", () => {
    const now = Date.UTC(2026, 9, 8)
    const path = BriefUploadsService.signedPath("clupload0000000000000000", now)
    const url = new URL(path, "http://x")
    const exp = url.searchParams.get("exp")!
    const sig = url.searchParams.get("sig")!
    expect(BriefUploadsService.verifySignature("clupload0000000000000000", exp, sig, now)).toBe(true)
    expect(BriefUploadsService.verifySignature("clother00000000000000000", exp, sig, now)).toBe(false)
    expect(BriefUploadsService.verifySignature("clupload0000000000000000", String(Number(exp) + 60), sig, now)).toBe(false)
    expect(BriefUploadsService.verifySignature("clupload0000000000000000", exp, sig, now + 11 * 60 * 1000)).toBe(false)
  })
})
