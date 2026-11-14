import type { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { FindingsService } from "./findings.service.js"

const ParamsSchema = z.object({ id: z.string().min(1).max(64) })

export const FindingsController = {
  get: async (req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    const params = ParamsSchema.safeParse(req.params)
    if (!params.success) {
      res.status(404).json({ success: false, message: "Finding not found" })
      return
    }
    try {
      const finding = await FindingsService.publicRef(params.data.id)
      res.status(200).json({ success: true, data: finding })
    } catch (err) {
      next(err)
    }
  },
}
