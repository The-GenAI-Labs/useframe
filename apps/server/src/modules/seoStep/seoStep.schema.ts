import { z } from "zod"

export const SeoStepRejectSchema = z.object({
  feedback: z.string().min(1).max(2000),
})

export type SeoStepRejectInput = z.infer<typeof SeoStepRejectSchema>
