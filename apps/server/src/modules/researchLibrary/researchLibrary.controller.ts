import type { Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { decodeCursor, ResearchLibraryService } from "./researchLibrary.service.js"
import { LibraryListQuerySchema, LibrarySlugParamsSchema } from "./researchLibrary.schema.js"

const noStore = (res: Response) => res.setHeader("Cache-Control", "private, no-store")

export const ResearchLibraryController = {
  categories: async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await ResearchLibraryService.categories()
      noStore(res)
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  },

  access: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await ResearchLibraryService.access(req.user!.id)
      noStore(res)
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  },

  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const query = LibraryListQuerySchema.safeParse(req.query)
    if (!query.success) {
      res.status(422).json({ success: false, message: "Validation failed", errors: query.error.flatten().fieldErrors })
      return
    }
    try {
      const data = await ResearchLibraryService.list(req.user!.id, { ...query.data, cursor: decodeCursor(query.data.cursor) })
      noStore(res)
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  },

  detail: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const params = LibrarySlugParamsSchema.safeParse(req.params)
    if (!params.success) {
      res.status(404).json({ success: false, message: "Finding not found" })
      return
    }
    try {
      noStore(res)
      const data = await ResearchLibraryService.detail(req.user!.id, params.data.slug)
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  },
}
