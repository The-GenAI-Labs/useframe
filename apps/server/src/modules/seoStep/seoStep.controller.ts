import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { SeoStepService } from "./seoStep.service.js"
import type { SeoStepRejectInput } from "./seoStep.schema.js"

export const SeoStepController = {
  generate: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await SeoStepService.generate(req.user!, req.params.slug!)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  approve: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await SeoStepService.approve(req.user!, req.params.slug!)
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
      const { feedback } = req.body as SeoStepRejectInput
      const result = await SeoStepService.reject(req.user!, req.params.slug!, feedback)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
