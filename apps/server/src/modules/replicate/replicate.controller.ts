import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { ReplicateService } from "./replicate.service.js"
import type { ReplicateRequestInput } from "./replicate.schema.js"

export const ReplicateController = {
  create: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await ReplicateService.replicate(
        req.user!.id,
        req.body as ReplicateRequestInput
      )
      res.status(201).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  list: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const replications = await ReplicateService.list(req.user!.id)
      res.json({ success: true, data: replications })
    } catch (err) {
      next(err)
    }
  },

  getBySlug: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const replication = await ReplicateService.getBySlug(req.user!.id, req.params.slug as string)
      res.json({ success: true, data: replication })
    } catch (err) {
      next(err)
    }
  },
}
