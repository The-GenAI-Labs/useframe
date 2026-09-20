import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { GenerateService } from "./generate.service.js"

export const GenerateController = {
  authorize: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await GenerateService.authorize(req.user!.id)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
