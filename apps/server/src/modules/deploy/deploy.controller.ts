import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { DeployService } from "./deploy.service.js"

export const DeployController = {
  create: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await DeployService.create(req.user!, req.params.slug!)
      res.status(202).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await DeployService.list(req.user!.id, req.params.slug!)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  get: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await DeployService.get(req.user!.id, req.params.slug!, req.params.deploymentId!)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  site: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await DeployService.site(req.user!.id, req.params.slug!)
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  rollback: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await DeployService.rollback(
        req.user!.id,
        req.params.slug!,
        req.params.deploymentId!
      )
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
