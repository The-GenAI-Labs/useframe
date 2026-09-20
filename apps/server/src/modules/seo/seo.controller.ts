import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { SeoService } from "./seo.service.js"
import type { CreateSeoAuditInput } from "./seo.schema.js"

export const SeoController = {
  create: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { url, tier } = req.body as CreateSeoAuditInput
      const result = await SeoService.create(req.user!.id, url, tier)
      res.status(201).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  get: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await SeoService.get(req.user!.id, req.params.id!)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
