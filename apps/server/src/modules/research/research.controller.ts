import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { ResearchService } from "./research.service.js"
import type { ResearchGenerateInput, ResearchRejectInput } from "./research.schema.js"

export const ResearchController = {
  generate: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { feedback } = req.body as ResearchGenerateInput
      const result = await ResearchService.generate(req.user!, req.params.slug!, feedback)
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
      const result = await ResearchService.approve(req.user!, req.params.slug!)
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
      const { feedback } = req.body as ResearchRejectInput
      const result = await ResearchService.reject(req.user!, req.params.slug!, feedback)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
