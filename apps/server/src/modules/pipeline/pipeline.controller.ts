import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { PipelineService } from "./pipeline.service.js"
import type { SetPipelineModeInput } from "./pipeline.schema.js"

export const PipelineController = {
  get: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await PipelineService.get(req.user!.id, req.params.slug!)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  setMode: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { mode } = req.body as SetPipelineModeInput
      const result = await PipelineService.setMode(req.user!.id, req.params.slug!, mode)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
