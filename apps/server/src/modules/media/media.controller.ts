import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { MediaService } from "./media.service.js"
import {
  ListMediaQuerySchema,
  type PatchMediaInput,
  type ResolveMediaInput,
  type StartUploadInput,
} from "./media.schema.js"

type Handler = (req: AuthenticatedRequest) => Promise<unknown>

const handle =
  (fn: Handler, status = 200) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(status).json({ success: true, data: await fn(req) })
    } catch (err) {
      next(err)
    }
  }

export const MediaController = {
  startUpload: handle(
    (req) => MediaService.startUpload(req.user!.id, req.params.slug!, req.body as StartUploadInput),
    201
  ),
  completeUpload: handle((req) => MediaService.completeUpload(req.user!.id, req.params.slug!, req.params.assetId!)),
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const query = ListMediaQuerySchema.safeParse(req.query)
    if (!query.success) {
      res.status(422).json({ success: false, message: "Validation failed", errors: query.error.flatten().fieldErrors })
      return
    }
    try {
      res.json({ success: true, data: await MediaService.list(req.user!.id, req.params.slug!, query.data) })
    } catch (err) {
      next(err)
    }
  },
  get: handle((req) => MediaService.get(req.user!.id, req.params.slug!, req.params.assetId!)),
  patch: handle((req) =>
    MediaService.patch(req.user!.id, req.params.slug!, req.params.assetId!, req.body as PatchMediaInput)
  ),
  remove: handle((req) =>
    MediaService.remove(req.user!.id, req.params.slug!, req.params.assetId!, req.query.force === "true")
  ),
  retry: handle((req) => MediaService.retry(req.user!.id, req.params.slug!, req.params.assetId!)),
  resolve: handle((req) =>
    MediaService.resolveForPreview(req.user!.id, req.params.slug!, (req.body as ResolveMediaInput).assetIds)
  ),
  quota: handle((req) => MediaService.quota(req.user!.id)),
}
