import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { DomainsService } from "./domains.service.js"
import type { AddDomainInput } from "./domains.schema.js"

export const DomainsController = {
  get: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await DomainsService.get(req.user!.id, req.params.slug!)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  add: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { domain } = req.body as AddDomainInput
      const result = await DomainsService.add(req.user!.id, req.params.slug!, domain)
      res.status(201).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
