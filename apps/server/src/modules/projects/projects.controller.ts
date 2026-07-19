import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { ProjectsService } from "./projects.service.js"
import type { CreateProjectInput, UpdateProjectInput } from "./projects.schema.js"

export const ProjectsController = {
  create: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await ProjectsService.createProject(
        req.user!.id,
        req.body as CreateProjectInput
      )
      res.status(201).json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  list: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const pinned =
        req.query.pinned === "true"
          ? true
          : req.query.pinned === "false"
            ? false
            : undefined
      const projects = await ProjectsService.listProjects(req.user!.id, pinned)
      res.json({ success: true, data: projects })
    } catch (err) {
      next(err)
    }
  },

  getBySlug: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const project = await ProjectsService.getProjectBySlug(
        req.user!.id,
        req.params.slug!
      )
      res.json({ success: true, data: project })
    } catch (err) {
      next(err)
    }
  },

  update: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const project = await ProjectsService.updateProject(
        req.user!.id,
        req.params.slug!,
        req.body as UpdateProjectInput
      )
      res.json({ success: true, data: project })
    } catch (err) {
      next(err)
    }
  },

  listVersions: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const versions = await ProjectsService.listVersions(
        req.user!.id,
        req.params.slug!
      )
      res.json({ success: true, data: versions })
    } catch (err) {
      next(err)
    }
  },

  getVersion: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const version = await ProjectsService.getVersion(
        req.user!.id,
        req.params.slug!,
        req.params.versionId!
      )
      res.json({ success: true, data: version })
    } catch (err) {
      next(err)
    }
  },
}
