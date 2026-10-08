import type { Request, Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { AppError } from "@/middleware/errorHandler.js"
import { BriefsService } from "./briefs.service.js"
import { BriefUploadsService } from "./briefUploads.service.js"
import {
  BriefUploadQuerySchema,
  type ApproveBriefInput,
  type CreateBriefInput,
  type PatchBriefInput,
  type PrefillBriefInput,
} from "./briefs.schema.js"

export const BriefsController = {
  create: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await BriefsService.createDraft(req.user!, req.body as CreateBriefInput)
      res.status(201).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  listOpen: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const drafts = await BriefsService.listOpenDrafts(req.user!.id)
      res.json({ success: true, data: { drafts } })
    } catch (err) {
      next(err)
    }
  },

  get: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const brief = await BriefsService.get(req.user!.id, req.params.id!)
      res.json({ success: true, data: { brief } })
    } catch (err) {
      next(err)
    }
  },

  patch: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const brief = await BriefsService.patchDraft(req.user!.id, req.params.id!, req.body as PatchBriefInput)
      res.json({ success: true, data: { brief } })
    } catch (err) {
      next(err)
    }
  },

  remove: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await BriefsService.deleteDraft(req.user!.id, req.params.id!)
      res.json({ success: true, data: null })
    } catch (err) {
      next(err)
    }
  },

  prefill: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Closing the modal (or cancelling) aborts the upstream LLM call too.
    const controller = new AbortController()
    res.on("close", () => {
      if (!res.writableEnded) controller.abort()
    })
    try {
      const result = await BriefsService.prefill(req.user!, req.params.id!, req.body as PrefillBriefInput, controller.signal)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  upload: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = BriefUploadQuerySchema.safeParse(req.query)
      if (!query.success) throw new AppError("Validation failed", 422)
      if (!Buffer.isBuffer(req.body)) throw new AppError("Send the file as the request body", 415)
      const brief = await BriefsService.storeUpload(req.user!.id, req.params.id!, query.data.field, query.data.name, req.body)
      res.status(201).json({ success: true, data: { brief } })
    } catch (err) {
      next(err)
    }
  },

  uploadForProject: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = BriefUploadQuerySchema.safeParse(req.query)
      if (!query.success) throw new AppError("Validation failed", 422)
      if (!Buffer.isBuffer(req.body)) throw new AppError("Send the file as the request body", 415)
      const brief = await BriefsService.storeUploadForProject(req.user!.id, req.params.slug!, query.data.field, query.data.name, req.body)
      res.status(201).json({ success: true, data: { brief } })
    } catch (err) {
      next(err)
    }
  },

  serveUpload: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const uploadId = String(req.params.uploadId ?? "")
      const { exp, sig } = req.query
      if (typeof exp !== "string" || typeof sig !== "string" || !BriefUploadsService.verifySignature(uploadId, exp, sig)) {
        throw new AppError("Not found", 404)
      }
      const upload = await BriefUploadsService.loadServable(uploadId)
      if (!upload) throw new AppError("Not found", 404)
      res.setHeader("Content-Type", upload.mime)
      res.setHeader("Cache-Control", "private, max-age=300")
      res.setHeader("X-Content-Type-Options", "nosniff")
      res.setHeader("Content-Security-Policy", "default-src 'none'")
      // The web app runs cross-origin-isolated for WebContainers, so the image
      // must opt in to being embedded from another origin.
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin")
      res.send(Buffer.from(upload.data))
    } catch (err) {
      next(err)
    }
  },

  getForProject: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const brief = await BriefsService.getForProject(req.user!, req.params.slug!)
      res.json({ success: true, data: { brief } })
    } catch (err) {
      next(err)
    }
  },

  patchForProject: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await BriefsService.patchForProject(req.user!, req.params.slug!, req.body as PatchBriefInput)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  approveForProject: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const brief = await BriefsService.approveForProject(req.user!, req.params.slug!, req.body as ApproveBriefInput)
      res.json({ success: true, data: { brief } })
    } catch (err) {
      next(err)
    }
  },
}
