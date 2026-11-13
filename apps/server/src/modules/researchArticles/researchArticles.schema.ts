import { z } from "zod"
import { ResearchCategoryEnum } from "@repo/schemas"

export const ArticleListQuerySchema = z.object({
  category: z.preprocess((v) => (v === "" ? undefined : v), ResearchCategoryEnum.optional()),
})

export const ArticleSlugParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
})
