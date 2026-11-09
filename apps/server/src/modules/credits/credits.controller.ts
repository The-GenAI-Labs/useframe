import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { env } from "@/config/env.js"
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
        env.AUTO_RELOAD_ENABLED ? callGetAutoReload(req.user!) : null,
      ])
      res.status(200).json({ success: true, data: { balance, autoReload } })
    } catch (err) {
      next(err)
    }
  },
}
