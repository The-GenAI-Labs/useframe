import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { prisma } from "@useframe/db"
import { verifyToken } from "@/lib/auth.js"
import { env } from "@/config/env.js"
import { getCheapModel } from "@/llm/router.js"
import { runBriefPrefill } from "@/agents/briefPrefill.agent.js"
import { resolveBrief } from "@/agents/briefResolve.agent.js"
import { extractDocumentText, kindForMime } from "@/lib/docExtract.js"
import { htmlToText, safeFetchText, UnsafeUrlError } from "@/tools/safeFetch.js"

const router: Router = Router()

const DOC_EXTRACT_TIMEOUT_MS = 15_000
const DOC_EXTRACT_MAX_CHARS = 60_000

const PrefillRequestSchema = z.discriminatedUnion("kind", [
  z.object({ briefId: z.string().cuid(), kind: z.literal("text"), text: z.string().min(1).max(20_000) }),
  z.object({ briefId: z.string().cuid(), kind: z.literal("url"), url: z.string().min(1).max(500) }),
  z.object({ briefId: z.string().cuid(), kind: z.literal("doc"), uploadId: z.string().cuid() }),
])

const ResolveRequestSchema = z.object({ briefId: z.string().cuid() })

function authUser(req: Request, res: Response): { id: string } | null {
  try {
    return verifyToken(req)
  } catch {
    res.status(401).json({ success: false, message: "Unauthorized" })
    return null
  }
}

router.post("/brief/prefill", (req: Request, res: Response): void => {
  const user = authUser(req, res)
  if (!user) return
  const parsed = PrefillRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ success: false, message: "Validation failed" })
    return
  }
  const input = parsed.data
  const controller = new AbortController()
  res.on("close", () => {
    if (!res.writableEnded) controller.abort()
  })
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(env.BRIEF_PREFILL_TIMEOUT_MS)])
  const started = Date.now()

  void (async () => {
    try {
      const brief = await prisma.projectBrief.findFirst({
        where: { id: input.briefId, userId: user.id },
        select: { id: true },
      })
      if (!brief) {
        res.status(404).json({ success: false, message: "Brief not found" })
        return
      }

      let source: string
      if (input.kind === "text") {
        source = input.text
      } else if (input.kind === "url") {
        const page = await safeFetchText(input.url, { signal })
        source = page.contentType.includes("text/plain") ? page.body : htmlToText(page.body, env.BRIEF_PREFILL_MAX_CHARS)
      } else {
        const upload = await prisma.briefUpload.findFirst({
          where: { id: input.uploadId, briefId: brief.id, userId: user.id, field: "sourceDocument" },
          select: { mime: true, data: true, size: true },
        })
        const kind = upload ? kindForMime(upload.mime) : null
        if (!upload || !kind || upload.size > env.BRIEF_DOC_MAX_BYTES) {
          res.status(404).json({ success: false, message: "Upload not found" })
          return
        }
        source = await extractDocumentText(kind, upload.data, {
          maxChars: DOC_EXTRACT_MAX_CHARS,
          timeoutMs: DOC_EXTRACT_TIMEOUT_MS,
          signal,
        })
      }

      source = source.slice(0, env.BRIEF_PREFILL_MAX_CHARS)
      if (!source.trim()) {
        res.status(422).json({ success: false, message: "We couldn't find any text in that" })
        return
      }

      const result = await runBriefPrefill(source, getCheapModel(), signal)
      console.log(
        `[brief.prefill] brief=${brief.id} kind=${input.kind} chars=${source.length} fields=${Object.keys(result.values).length} ms=${Date.now() - started}`,
      )
      res.json({ success: true, data: result })
    } catch (err) {
      if (res.headersSent || controller.signal.aborted) return
      if (err instanceof UnsafeUrlError) {
        res.status(422).json({ success: false, message: err.message, code: "UNSAFE_URL" })
        return
      }
      console.error(`[brief.prefill] failed kind=${input.kind}:`, err instanceof Error ? err.name : "unknown")
      res.status(502).json({ success: false, message: "Couldn't read that" })
    }
  })()
})

router.post("/brief/resolve", (req: Request, res: Response): void => {
  const user = authUser(req, res)
  if (!user) return
  const parsed = ResolveRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({ success: false, message: "Validation failed" })
    return
  }

  resolveBrief(parsed.data.briefId, user.id, getCheapModel())
    .then((outcome) => res.json({ success: true, data: { status: outcome.status } }))
    .catch((err: unknown) => {
      console.error("[brief.resolve] failed:", err instanceof Error ? err.message : "unknown")
      res.status(err instanceof Error && err.message === "Brief not found" ? 404 : 500).json({
        success: false,
        message: "Couldn't resolve the brief",
      })
    })
})

export default router
