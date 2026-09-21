import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { BillingService } from "./billing.service.js"
import type { CheckoutInput, AutoReloadInput } from "./billing.schema.js"

export const BillingController = {
  createCheckout: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { packId, amountCents } = req.body as CheckoutInput
      const result = await BillingService.createCheckout(req.user!, { packId, amountCents })
      res.status(201).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  createSetupIntent: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await BillingService.createSetupIntent(req.user!)
      res.status(201).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  getAutoReload: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await BillingService.getAutoReload(req.user!)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  putAutoReload: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const input = req.body as AutoReloadInput
      const result = await BillingService.putAutoReload(req.user!, input)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
