import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import sharp from "sharp"
import { prisma } from "@useframe/db"
import type { BriefUploadField } from "@repo/schemas"
import { env } from "@/config/env.js"
import { AppError } from "@/middleware/errorHandler.js"

const SIGNED_URL_TTL_SECONDS = 10 * 60
const LOGO_MAX_DIMENSION = 1024

type DocKind = "pdf" | "docx" | "pptx" | "txt" | "md"

const DOC_MIME: Record<DocKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
}

const signingKey = createHash("sha256").update(`brief-upload:${env.JWT_ACCESS_SECRET}`).digest()

export function sniffImage(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp"
  return null
}

function extensionOf(name: string | undefined): string {
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(name ?? "")
  return match ? match[1]!.toLowerCase() : ""
}

// Extension says what the user meant; magic bytes decide whether we believe it.
export function sniffDocument(buf: Buffer, name: string | undefined): DocKind | null {
  const ext = extensionOf(name)
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return ext === "pdf" || ext === "" ? "pdf" : null
  const isZip = buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
  if (isZip) {
    if (ext === "docx" && buf.includes(Buffer.from("word/"))) return "docx"
    if (ext === "pptx" && buf.includes(Buffer.from("ppt/"))) return "pptx"
    return null
  }
  if (ext === "txt" || ext === "md") {
    if (buf.includes(0)) return null
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buf)
    } catch {
      return null
    }
    return ext
  }
  return null
}

function safeFileName(name: string | undefined): string | undefined {
  if (!name) return undefined
  const cleaned = name.replace(/[^\w.\- ]+/g, "").trim().slice(0, 120)
  return cleaned || undefined
}

export type StoredUpload = {
  uploadId: string
  mime: string
  name?: string
  size: number
  width?: number
  height?: number
}

export const BriefUploadsService = {
  async store(params: {
    userId: string
    briefId: string
    field: BriefUploadField
    name?: string
    body: Buffer
  }): Promise<StoredUpload> {
    const { userId, briefId, field, body } = params
    if (body.length === 0) throw new AppError("The file is empty", 422)

    let mime: string
    let bytes: Buffer
    let width: number | undefined
    let height: number | undefined
    let expiresAt: Date | null = null
    const name = safeFileName(params.name)

    if (field === "logo") {
      if (body.length > env.BRIEF_LOGO_MAX_BYTES) throw new AppError("Logos can be up to 2 MB", 413)
      const sniffed = sniffImage(body)
      if (!sniffed) throw new AppError("Use a PNG, JPG or WebP image", 415)
      // Re-encoding drops EXIF/ICC metadata and anything appended after the
      // image data; rotate() first so the orientation tag isn't lost.
      const pipeline = sharp(body, { limitInputPixels: 40_000_000 })
        .rotate()
        .resize({ width: LOGO_MAX_DIMENSION, height: LOGO_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      const encoded =
        sniffed === "image/png"
          ? pipeline.png()
          : sniffed === "image/webp"
            ? pipeline.webp({ quality: 90 })
            : pipeline.jpeg({ quality: 90 })
      const { data, info } = await encoded.toBuffer({ resolveWithObject: true }).catch(() => {
        throw new AppError("That image couldn't be read", 415)
      })
      mime = sniffed
      bytes = data
      width = info.width
      height = info.height
    } else {
      if (body.length > env.BRIEF_DOC_MAX_BYTES) throw new AppError("Documents can be up to 10 MB", 413)
      const kind = sniffDocument(body, name)
      if (!kind) throw new AppError("Use a PDF, DOCX, PPTX, TXT or MD file", 415)
      mime = DOC_MIME[kind]
      bytes = body
      expiresAt = new Date(Date.now() + env.BRIEF_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000)
    }

    const upload = await prisma.$transaction(async (tx) => {
      await tx.briefUpload.deleteMany({ where: { briefId, userId, field } })
      return tx.briefUpload.create({
        data: {
          userId,
          briefId,
          field,
          mime,
          name,
          size: bytes.length,
          width,
          height,
          data: new Uint8Array(bytes),
          expiresAt,
        },
        select: { id: true },
      })
    })

    return { uploadId: upload.id, mime, name, size: bytes.length, width, height }
  },

  signedPath(uploadId: string, now = Date.now()): string {
    const exp = Math.floor(now / 1000) + SIGNED_URL_TTL_SECONDS
    const sig = createHmac("sha256", signingKey).update(`${uploadId}.${exp}`).digest("base64url")
    return `/api/brief-uploads/${uploadId}?exp=${exp}&sig=${sig}`
  },

  verifySignature(uploadId: string, exp: string, sig: string, now = Date.now()): boolean {
    const expNum = Number(exp)
    if (!Number.isInteger(expNum) || expNum < Math.floor(now / 1000)) return false
    const expected = createHmac("sha256", signingKey).update(`${uploadId}.${expNum}`).digest()
    let given: Buffer
    try {
      given = Buffer.from(sig, "base64url")
    } catch {
      return false
    }
    return given.length === expected.length && timingSafeEqual(given, expected)
  },

  async loadServable(uploadId: string): Promise<{ mime: string; data: Uint8Array } | null> {
    const upload = await prisma.briefUpload.findUnique({
      where: { id: uploadId },
      select: { mime: true, data: true, field: true },
    })
    // Only logos are ever served back; source documents are read server-side.
    if (!upload || upload.field !== "logo") return null
    return { mime: upload.mime, data: upload.data }
  },
}
