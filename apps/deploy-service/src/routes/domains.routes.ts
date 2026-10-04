import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { DomainDeps } from "@/domains/deps.js";
import {
  addDomain,
  checkNow,
  getProjectDomain,
  removeDomain,
  retryDomain,
  teardownUserDomains,
} from "@/domains/service.js";
import { HttpError } from "@/services/httpError.js";

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const ProjectParams = z.object({ projectId: id });
const DomainParams = z.object({ projectId: id, domainId: id });
const AddSchema = z.object({ hostname: z.string().min(1).max(300) });

type Handler = (req: Request) => Promise<unknown>;

function handle(fn: Handler, status = 200) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.status(status).json({ success: true, data: await fn(req) });
    } catch (err) {
      next(err);
    }
  };
}

// Mounted under /internal (service auth already applied).
export function domainsRouter(getDeps: () => DomainDeps | null | undefined): Router {
  const router = Router();
  const enabled = () => {
    const deps = getDeps();
    if (!deps) throw new HttpError(404, "Custom domains are not available yet.", "feature_disabled");
    return deps;
  };

  router.get(
    "/projects/:projectId/domains",
    handle(async (req) => {
      const deps = getDeps();
      if (!deps) return { enabled: false, domain: null };
      return { enabled: true, domain: await getProjectDomain(deps, ProjectParams.parse(req.params).projectId) };
    }),
  );
  router.post(
    "/projects/:projectId/domains",
    handle(async (req) =>
      addDomain(enabled(), ProjectParams.parse(req.params).projectId, AddSchema.parse(req.body).hostname),
    ),
  );
  router.post(
    "/projects/:projectId/domains/:domainId/check",
    handle(async (req) => {
      const p = DomainParams.parse(req.params);
      return checkNow(enabled(), p.projectId, p.domainId);
    }),
  );
  router.post(
    "/projects/:projectId/domains/:domainId/retry",
    handle(async (req) => {
      const p = DomainParams.parse(req.params);
      return retryDomain(enabled(), p.projectId, p.domainId);
    }),
  );
  router.delete(
    "/projects/:projectId/domains/:domainId",
    handle(async (req) => {
      const p = DomainParams.parse(req.params);
      return removeDomain(enabled(), p.projectId, p.domainId);
    }),
  );
  router.post(
    "/users/:userId/domains/teardown",
    handle(async (req) => {
      const deps = getDeps();
      return { tornDown: deps ? await teardownUserDomains(deps, id.parse(req.params.userId)) : 0 };
    }),
  );
  return router;
}
