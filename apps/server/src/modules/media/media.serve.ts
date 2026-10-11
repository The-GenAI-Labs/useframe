import { Router, type Request, type Response } from "express"
import { isMediaVariantRole } from "@repo/schemas"
import { env } from "@/config/env.js"
import { getMediaStorage } from "@/lib/mediaStorage.js"
import { MediaService } from "./media.service.js"
import { verifyMediaSignature } from "./media.signing.js"

export type ByteRange = { start: number; end: number }

// Single ranges only; a multipart byteranges response is never needed for media.
export function parseRange(header: string | undefined, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === "" && match[2] === "")) return "unsatisfiable"
  if (match[1] === "") {
    const suffix = Number(match[2])
    if (suffix === 0 || size === 0) return "unsatisfiable"
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (start >= size || end < start) return "unsatisfiable"
  return { start, end }
}

function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false
  const bare = (tag: string) => tag.trim().replace(/^W\//, "")
  return header.split(",").some((tag) => tag.trim() === "*" || bare(tag) === etag)
}

function allowedOrigins(): Set<string> {
  return new Set(
    [env.CLIENT_URL, env.FRONTEND_URL, ...env.MEDIA_CORS_ORIGINS.split(",")]
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => {
        try {
          return new URL(o).origin
        } catch {
          return ""
        }
      })
      .filter(Boolean)
  )
}

function commonHeaders(req: Request, res: Response): void {
  res.setHeader("X-Content-Type-Options", "nosniff")
  // Preview iframes (WebContainer, COEP credentialless) load these cross-origin.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
  res.setHeader("Vary", "Origin")
  res.setHeader("Cache-Control", "private, max-age=300")
  const origin = req.get("origin")
  if (origin && allowedOrigins().has(origin)) res.setHeader("Access-Control-Allow-Origin", origin)
}

async function serve(req: Request, res: Response): Promise<void> {
  const { assetId = "", role = "" } = req.params as { assetId?: string; role?: string }
  commonHeaders(req, res)
  if (!isMediaVariantRole(role) || !verifyMediaSignature(assetId, role, req.query.exp, req.query.sig)) {
    res.status(403).json({ success: false, message: "Forbidden" })
    return
  }
  const storage = getMediaStorage()
  const variant = await MediaService.servable(assetId, role)
  if (!storage || !variant) {
    res.status(404).json({ success: false, message: "Not found" })
    return
  }

  const etag = `"${variant.sha256}"`
  res.setHeader("ETag", etag)
  res.setHeader("Accept-Ranges", "bytes")
  res.setHeader("Content-Type", variant.mime)
  if (etagMatches(req.get("if-none-match"), etag)) {
    res.status(304).end()
    return
  }

  const range = parseRange(req.get("range"), variant.bytes)
  if (range === "unsatisfiable") {
    res.setHeader("Content-Range", `bytes */${variant.bytes}`)
    res.status(416).end()
    return
  }
  const length = range ? range.end - range.start + 1 : variant.bytes
  res.setHeader("Content-Length", String(length))
  if (range) res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${variant.bytes}`)
  res.status(range ? 206 : 200)
  if (req.method === "HEAD") {
    res.end()
    return
  }

  const object = await storage.get(variant.key, range ?? undefined)
  if (!object) {
    res.removeHeader("Content-Length")
    res.removeHeader("Content-Range")
    res.status(404).json({ success: false, message: "Not found" })
    return
  }
  res.on("close", () => object.body.destroy())
  object.body.on("error", () => res.destroy())
  object.body.pipe(res)
}

export const mediaServeRouter: Router = Router()

mediaServeRouter.options("/:assetId/:role", (req: Request, res: Response) => {
  commonHeaders(req, res)
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD")
  res.setHeader("Access-Control-Allow-Headers", "Range, If-None-Match")
  res.status(204).end()
})

mediaServeRouter.get("/:assetId/:role", (req, res, next) => {
  serve(req, res).catch(next)
})
