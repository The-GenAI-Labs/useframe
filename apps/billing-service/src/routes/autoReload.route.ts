import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { prisma } from "@useframe/db"

const router: Router = Router()

const AutoReloadSchema = z.object({
  enabled: z.boolean(),
  thresholdCents: z.number().int().positive(),
  topUpToCents: z.number().int().min(500, "Top-up amount must be at least $5"),
})

router.get("/auto-reload", (req: Request, res: Response, next) => {
  const userId = req.headers["x-user-id"] as string | undefined
  if (!userId) {
    res.status(401).json({ success: false, message: "Missing user identity" })
    return
  }

  prisma.autoReloadSetting
    .findUnique({ where: { userId } })
    .then((setting: { enabled: boolean; thresholdCents: number; topUpToCents: number } | null) => {
      res.json({
        success: true,
        data: setting ?? { enabled: false, thresholdCents: null, topUpToCents: null },
      })
    })
    .catch(next)
})

router.put("/auto-reload", (req: Request, res: Response, next) => {
  const userId = req.headers["x-user-id"] as string | undefined
  if (!userId) {
    res.status(401).json({ success: false, message: "Missing user identity" })
    return
  }

  const parsed = AutoReloadSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const { enabled, thresholdCents, topUpToCents } = parsed.data

  const paymentMethodCheck = enabled
    ? prisma.user.findUnique({ where: { id: userId }, select: { defaultPaymentMethodId: true } })
    : Promise.resolve(null)

  paymentMethodCheck
    .then((user: { defaultPaymentMethodId: string | null } | null) => {
      if (enabled && !user?.defaultPaymentMethodId) {
        res.status(400).json({
          success: false,
          message: "Add a saved card before enabling auto-reload",
        })
        return
      }

      return prisma.autoReloadSetting
        .upsert({
          where: { userId },
          create: { userId, enabled, thresholdCents, topUpToCents },
          update: { enabled, thresholdCents, topUpToCents },
        })
        .then((setting: { enabled: boolean; thresholdCents: number; topUpToCents: number }) => {
          res.json({ success: true, data: setting })
        })
    })
    .catch(next)
})

export default router
