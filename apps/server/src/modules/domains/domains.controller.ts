import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { DomainsService } from "./domains.service.js"
import type { AddDomainInput } from "./domains.schema.js"

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

export const DomainsController = {
  get: handle((req) => DomainsService.get(req.user!.id, req.params.slug!)),
  add: handle(
    (req) => DomainsService.add(req.user!.id, req.params.slug!, (req.body as AddDomainInput).hostname),
    201
  ),
  check: handle((req) => DomainsService.check(req.user!.id, req.params.slug!, req.params.domainId!)),
  retry: handle((req) => DomainsService.retry(req.user!.id, req.params.slug!, req.params.domainId!)),
  remove: handle((req) => DomainsService.remove(req.user!.id, req.params.slug!, req.params.domainId!)),
}
