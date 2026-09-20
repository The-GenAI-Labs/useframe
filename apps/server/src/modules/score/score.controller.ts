import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { ScoreService } from "./score.service.js"
import type { CreateScoreInput } from "./score.schema.js"

export const ScoreController = {
  create: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { url, force } = req.body as CreateScoreInput
      const result = await ScoreService.create(req.user!.id, url, force)
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
      const result = await ScoreService.get(req.params.scoreId!)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  getScreenshot: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await ScoreService.getScreenshot(req.params.scoreId!)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
