import type { Request, Response, NextFunction } from "express"
import { ResearchArticlesService } from "./researchArticles.service.js"
import { ArticleListQuerySchema, ArticleSlugParamsSchema } from "./researchArticles.schema.js"

export const ResearchArticlesController = {
  list: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const query = ArticleListQuerySchema.safeParse(req.query)
    if (!query.success) {
      res.status(422).json({ success: false, message: "Validation failed", errors: query.error.flatten().fieldErrors })
      return
    }
    try {
      const data = await ResearchArticlesService.list(query.data.category)
      res.setHeader("Cache-Control", "public, max-age=300")
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  },

  get: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const params = ArticleSlugParamsSchema.safeParse(req.params)
    if (!params.success) {
      res.status(404).json({ success: false, message: "Article not found" })
      return
    }
    try {
      const data = await ResearchArticlesService.get(params.data.slug)
      res.setHeader("Cache-Control", "public, max-age=300")
      res.json({ success: true, data })
    } catch (err) {
      next(err)
    }
  },
}
