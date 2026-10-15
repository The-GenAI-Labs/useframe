import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { MediaJobsService } from "./mediaJobs.service.js"
import { AccountEstimateQuerySchema, type CheckpointAction, type StartJobInput } from "./mediaJobs.schema.js"

type Handler = (req: AuthenticatedRequest) => Promise<unknown>

const handle =
  (fn: Handler, status = 200) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.status(status).json({ success: true, data: await fn(req) })
    } catch (err) {
      next(err)
    }
  }

export const MediaJobsController = {
  estimate: handle((req) => MediaJobsService.estimate(req.user!.id, req.params.slug!)),
  start: handle((req) => MediaJobsService.start(req.user!.id, req.params.slug!, req.body as StartJobInput), 201),
  latest: handle((req) => MediaJobsService.latest(req.user!.id, req.params.slug!)),
  get: handle((req) => MediaJobsService.get(req.user!.id, req.params.slug!, req.params.jobId!)),
  checkpoint: handle((req) =>
    MediaJobsService.checkpoint(req.user!.id, req.params.slug!, req.params.jobId!, req.body as CheckpointAction),
  ),
  cancel: handle((req) => MediaJobsService.cancel(req.user!.id, req.params.slug!, req.params.jobId!)),
  accountEstimate: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const query = AccountEstimateQuerySchema.safeParse(req.query)
    if (!query.success) {
      res.status(422).json({ success: false, message: "Validation failed", errors: query.error.flatten().fieldErrors })
      return
    }
    try {
      res.json({ success: true, data: await MediaJobsService.accountEstimate(req.user!.id, query.data.budget) })
    } catch (err) {
      next(err)
    }
  },
}
