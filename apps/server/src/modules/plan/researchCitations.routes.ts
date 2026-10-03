import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "@/types/index.js";
import { authenticate } from "@/middleware/authenticate.js";
import { AppError } from "@/middleware/errorHandler.js";
import { PlanService } from "./plan.service.js";
const router: Router = Router();
router.get(
  "/:projectId/research/citations",
  authenticate,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const parsed = z
        .object({ projectId: z.string().cuid() })
        .safeParse(req.params);
      if (!parsed.success) throw new AppError("Invalid project ID", 422);
      const data = await PlanService.getResearchCitations(
        req.user!,
        parsed.data.projectId,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
export default router;
