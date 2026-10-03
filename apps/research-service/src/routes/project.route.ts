import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { withResearchTrace } from "@repo/rag";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import {
  RetrievalInputSchema,
  SaveCitationsRequestSchema,
} from "@repo/schemas";
import {
  getProjectResearch,
  retrieveForProject,
  saveCitations,
} from "@/retrieval/project.js";

const router: Router = Router();
router.use((req, res, next) => {
  const actual = req.get("x-internal-secret") ?? "";
  const expected = env.INTERNAL_SERVICE_SECRET;
  if (
    !expected ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  ) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }
  next();
});

function validationFailed(res: Response, error: z.ZodError): void {
  res
    .status(422)
    .json({
      success: false,
      message: "Validation failed",
      errors: error.flatten().fieldErrors,
    });
}

router.post(
  "/retrieve/project",
  (req: Request, res: Response, next: NextFunction) => {
    const parsed = RetrievalInputSchema.safeParse(req.body);
    if (!parsed.success) return validationFailed(res, parsed.error);
    withResearchTrace(req.get("x-research-trace-id"), () =>
      retrieveForProject(parsed.data),
    )
      .then((data) => res.json({ success: true, data }))
      .catch(next);
  },
);

router.post("/citations", (req: Request, res: Response, next: NextFunction) => {
  const parsed = SaveCitationsRequestSchema.safeParse(req.body);
  if (!parsed.success) return validationFailed(res, parsed.error);
  saveCitations(parsed.data.researchReportId, parsed.data.citations)
    .then(() => res.json({ success: true, data: null }))
    .catch((err: unknown) => {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "P2025"
      ) {
        res
          .status(404)
          .json({ success: false, message: "Research report not found" });
        return;
      }
      next(err);
    });
});

const ProjectParamsSchema = z.object({ projectId: z.string().min(1) });

router.get(
  "/projects/:projectId/research/citations",
  (req: Request, res: Response, next: NextFunction) => {
    const parsed = ProjectParamsSchema.safeParse(req.params);
    if (!parsed.success) return validationFailed(res, parsed.error);
    getProjectResearch(parsed.data.projectId)
      .then((view) => {
        if (!view) {
          res
            .status(404)
            .json({
              success: false,
              message: "No research report for this project",
            });
          return;
        }
        res.json({ success: true, data: view });
      })
      .catch(next);
  },
);

export default router;
