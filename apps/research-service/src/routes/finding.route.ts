import { Router, type Request, type Response } from "express"
import { prisma } from "@useframe/db"

const router: Router = Router()

router.get("/finding/:id", (req: Request, res: Response, next) => {
  prisma.researchFinding
    .findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        claim: true,
        paper: true,
        field: true,
        decision: true,
        options: true,
        contextHeader: true,
        verified: true,
      },
    })
    .then((finding: unknown) => {
      if (!finding) {
        res.status(404).json({ success: false, message: "Finding not found" })
        return
      }
      res.json({ success: true, data: finding })
    })
    .catch(next)
})

export default router
