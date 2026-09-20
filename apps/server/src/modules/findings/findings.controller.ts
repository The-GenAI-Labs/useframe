import type { Request, Response, NextFunction } from "express"
import { callGetFinding } from "@/lib/researchService.js"

export const FindingsController = {
  get: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const finding = await callGetFinding(req.params.id!)
      res.status(200).json({ success: true, data: finding })
    } catch (err) {
      next(err)
    }
  },
}
