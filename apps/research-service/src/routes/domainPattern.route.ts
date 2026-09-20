import { Router, type Request, type Response } from "express"
import { prisma } from "@useframe/db"

const router: Router = Router()

router.get("/domain-pattern/:domain", (req: Request, res: Response, next) => {
  prisma.domainPattern
    .findUnique({ where: { domain: req.params.domain } })
    .then((pattern: unknown) => {
      if (!pattern) {
        res.status(404).json({ success: false, message: "Domain pattern not found" })
        return
      }
      res.json({ success: true, data: pattern })
    })
    .catch(next)
})

export default router
