import { z } from "zod"

export const CitationSchema = z.object({
  id: z.string(),
  articleId: z.string().optional(),
  title: z.string(),
  source: z.string(),
  url: z.string().optional(),
  relevance: z.string().optional(),
  appliedTo: z.string().optional(),
})

export type Citation = z.infer<typeof CitationSchema>
