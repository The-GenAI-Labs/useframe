import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { CreditsService } from "./credits.service.js"
import { callGetAutoReload } from "@/lib/billingService.js"

export const CreditsController = {
  getSummary: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const [balance, autoReload] = await Promise.all([
        CreditsService.getBalance(req.user!.id),
        callGetAutoReload(req.user!),
      ])
      res.status(200).json({ success: true, data: { balance, autoReload } })
    } catch (err) {
      next(err)
    }
  },
}
