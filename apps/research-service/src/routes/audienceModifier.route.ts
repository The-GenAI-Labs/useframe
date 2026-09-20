import { Router, type Request, type Response } from "express"
import { prisma } from "@useframe/db"

const router: Router = Router()

router.get("/audience-modifier/:audience", (req: Request, res: Response, next) => {
  prisma.audienceModifier
    .findUnique({ where: { audience: req.params.audience } })
    .then((modifier: unknown) => {
      if (!modifier) {
        res.status(404).json({ success: false, message: "Audience modifier not found" })
        return
      }
      res.json({ success: true, data: modifier })
    })
    .catch(next)
})

export default router
