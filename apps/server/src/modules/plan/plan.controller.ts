import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { PlanService } from "./plan.service.js"
import { callGetFinding } from "@/lib/researchService.js"
import type {
  PlanGenerateInput,
  PlanPdfInput,
  PlanRejectInput,
  PlanSelectInput,
  PlanUpdateInput,
} from "./plan.schema.js"

export const PlanController = {
  get: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await PlanService.get(req.user!, req.params.slug!)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  update: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { brief } = req.body as PlanUpdateInput
      const result = await PlanService.update(req.user!, req.params.slug!, brief)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  generate: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { feedback } = req.body as PlanGenerateInput
      const result = await PlanService.generate(req.user!, req.params.slug!, feedback)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  approve: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await PlanService.approve(req.user!, req.params.slug!)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  select: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await PlanService.select(
        req.user!,
        req.params.slug!,
        req.body as PlanSelectInput
      )
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  requestPdf: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await PlanService.requestPdf(
        req.user!,
        req.params.slug!,
        req.body as PlanPdfInput
      )
      res.status(202).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  reject: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { feedback } = req.body as PlanRejectInput
      const result = await PlanService.reject(req.user!, req.params.slug!, feedback)
      res.status(200).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  getFinding: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const finding = await callGetFinding(req.params.findingId!)
      res.status(200).json({ success: true, data: finding })
    } catch (err) {
      next(err)
    }
  },
}
