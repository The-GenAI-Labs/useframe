import { Router, type Response, type NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { authenticate } from "@/middleware/authenticate.js"
import { PlanService } from "./plan.service.js"

const router: Router = Router()

router.use(authenticate)

// Serves a generated PDF inline so the chat attachment can render it in an
// iframe. Ownership is enforced in the service — a document id alone must
// not be enough to read someone else's report.
router.get(
  "/:documentId",
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { pdf, title } = await PlanService.getDocument(req.user!, req.params.documentId!)

      res.setHeader("Content-Type", "application/pdf")
      res.setHeader("Content-Disposition", `inline; filename="${title.replace(/"/g, "")}.pdf"`)
      res.send(Buffer.from(pdf))
    } catch (err) {
      next(err)
    }
  }
)

export default router
