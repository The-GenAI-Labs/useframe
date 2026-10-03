import { UnsupportedValidationCorrection } from "@repo/validation";
import { isValidationWorker } from "../lib/internalValidationAuth.js";
import {
  AutoIterateSchema,
  iterateValidationVersion,
} from "../validation/iterateVersion.js";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { IterateRequestSchema } from "@repo/schemas";
import { verifyToken } from "@/lib/auth.js";
import { runIteration } from "@/agents/iterate.agent.js";

const router: Router = Router();

router.post(
  "/iterate",
  (req: Request, res: Response, next: NextFunction): void => {
    if (req.body?.triggeredBy === "auto_validation") {
      if (!isValidationWorker(req)) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      const input = AutoIterateSchema.safeParse(req.body);
      if (!input.success) {
        res.status(422).json({ message: "Invalid validation correction" });
        return;
      }
      void iterateValidationVersion(input.data)
        .then((version) => res.json({ id: version.id }))
        .catch((error: unknown) => {
          if (error instanceof UnsupportedValidationCorrection) {
            res
              .status(422)
              .json({
                code: "UNSUPPORTED_VALIDATION_CORRECTION",
                message: error.message,
              });
            return;
          }
          next(error);
        });
      return;
    }
    try {
      verifyToken(req);
    } catch (err) {
      console.error(
        "[iterate] auth failed:",
        err instanceof Error ? err.message : err,
      );
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const parsed = IterateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    runIteration(parsed.data)
      .then((result) => {
        res.status(200).json({ success: true, data: result });
      })
      .catch((err) => {
        console.error(
          "[iterate] failed:",
          err instanceof Error ? err.message : err,
        );
        next(err);
      });
  },
);

export default router;
