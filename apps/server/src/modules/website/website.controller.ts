import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { WebsiteService } from "./website.service.js"
import type { WebsiteRejectInput } from "./website.schema.js"

export const WebsiteController = {
  approve: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await WebsiteService.approve(req.user!, req.params.slug!)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  reject: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { feedback } = req.body as WebsiteRejectInput
      const result = await WebsiteService.reject(req.user!, req.params.slug!, feedback)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
