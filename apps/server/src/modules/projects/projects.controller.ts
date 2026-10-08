import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { ProjectsService } from "./projects.service.js"
import { BriefsService } from "@/modules/briefs/briefs.service.js"
import type { CreateProjectFromBriefInput, CreateProjectInput, UpdateProjectInput } from "./projects.schema.js"

export const ProjectsController = {
  create: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const body = req.body as CreateProjectFromBriefInput | CreateProjectInput
      if ("briefId" in body) {
        const result = await BriefsService.createProjectFromBrief(req.user!, body.briefId)
        res.status(201).json({ success: true, data: result })
        return
      }
      const result = await ProjectsService.createProject(req.user!.id, body)
      await BriefsService.createLegacyBrief(req.user!.id, result.project.id, body).catch((err) =>
        console.error("[projects] legacy brief failed:", err instanceof Error ? err.name : "unknown")
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

  createVersion: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await ProjectsService.createVersion(
        req.user!.id,
        req.params.slug!
      )
      res.status(201).json({ success: true, data: result })
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

  getVersionSnapshot: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await ProjectsService.getVersionSnapshot(
        req.user!.id,
        req.params.slug!,
        req.params.versionId!
      )
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  restoreVersion: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await ProjectsService.restoreVersion(
        req.user!.id,
        req.params.slug!,
        req.params.versionId!
      )
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },

  getResearchReport: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const result = await ProjectsService.getResearchReport(
        req.user!.id,
        req.params.slug!
      )
      res.json({ success: true, data: result })
    } catch (err) {
      next(err)
    }
  },
}
