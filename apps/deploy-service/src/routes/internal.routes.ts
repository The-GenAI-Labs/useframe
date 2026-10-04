import { timingSafeEqual } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { Deps } from "@/deps.js";
import {
  cancelDeployment,
  createDeployment,
  findDeployment,
  getDeployment,
  getSite,
  listDeployments,
} from "@/services/deployments.js";
import { HttpError } from "@/services/httpError.js";
import { rollback } from "@/services/rollback.js";
import { removeSite } from "@/services/siteAdmin.js";
import { domainsRouter } from "./domains.routes.js";

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

const CreateSchema = z.object({
  projectId: id,
  versionId: id,
  userId: id,
  triggeredBy: z.enum(["user", "domain_change", "rollback"]).default("user"),
});
const RollbackSchema = z.object({ deploymentId: id });
const ProjectParams = z.object({ projectId: id });
const DeploymentParams = z.object({ projectId: id, deploymentId: id });

export function requireInternalSecret(secret: string) {
  const expected = Buffer.from(secret);
  return (req: Request, res: Response, next: NextFunction): void => {
    const actual = Buffer.from(req.get("x-internal-secret") ?? "");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    next();
  };
}

type Handler = (req: Request, res: Response) => Promise<unknown>;

function handle(fn: Handler, status = 200) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await fn(req, res);
      res.status(status).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };
}

export function internalRouter(deps: Deps, secret: string): Router {
  const router = Router();
  router.use(requireInternalSecret(secret));

  router.post(
    "/deployments",
    handle(async (req) => createDeployment(deps, CreateSchema.parse(req.body)), 202),
  );
  router.get(
    "/deployments/:deploymentId",
    handle(async (req) => findDeployment(deps, id.parse(req.params.deploymentId))),
  );
  router.get(
    "/projects/:projectId/deployments",
    handle(async (req) => listDeployments(deps, ProjectParams.parse(req.params).projectId)),
  );
  router.get(
    "/projects/:projectId/deployments/:deploymentId",
    handle(async (req) => {
      const p = DeploymentParams.parse(req.params);
      return getDeployment(deps, p.projectId, p.deploymentId);
    }),
  );
  router.post(
    "/projects/:projectId/deployments/:deploymentId/cancel",
    handle(async (req) => {
      const p = DeploymentParams.parse(req.params);
      return cancelDeployment(deps, p.projectId, p.deploymentId);
    }),
  );
  router.get(
    "/projects/:projectId/site",
    handle(async (req) => getSite(deps, ProjectParams.parse(req.params).projectId)),
  );
  router.post(
    "/projects/:projectId/rollback",
    handle(async (req) =>
      rollback(deps, ProjectParams.parse(req.params).projectId, RollbackSchema.parse(req.body).deploymentId),
    ),
  );
  router.delete(
    "/projects/:projectId/site",
    handle(async (req) => removeSite(deps, ProjectParams.parse(req.params).projectId)),
  );
  router.use(domainsRouter(() => deps.domains));
  return router;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message, code: err.code });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(422).json({ success: false, message: "Invalid request", errors: err.flatten().fieldErrors });
    return;
  }
  console.error(JSON.stringify({ level: "error", msg: "unhandled", error: err instanceof Error ? err.message : String(err) }));
  res.status(500).json({ success: false, message: "Internal server error" });
}
