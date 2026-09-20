import { z } from "zod"

export const ResearchGenerateSchema = z.object({
  feedback: z.string().max(2000).optional(),
})

export const ResearchRejectSchema = z.object({
  feedback: z.string().min(1).max(2000),
})

export type ResearchGenerateInput = z.infer<typeof ResearchGenerateSchema>
export type ResearchRejectInput = z.infer<typeof ResearchRejectSchema>
