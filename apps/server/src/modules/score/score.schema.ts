import { z } from "zod"

export const CreateScoreSchema = z.object({
  url: z.string().url(),
  force: z.boolean().optional(),
})

export type CreateScoreInput = z.infer<typeof CreateScoreSchema>
