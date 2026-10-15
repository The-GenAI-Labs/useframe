import type { Request, Response, NextFunction } from "express"
import { PlansService } from "./plans.service.js"

export const PlansController = {
  list: async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const plans = await PlansService.listActive()
      res.setHeader("Cache-Control", "public, max-age=60")
      res.status(200).json({ success: true, data: plans })
    } catch (err) {
      next(err)
    }
  },
}
