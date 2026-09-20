import { z } from "zod"

export const WebsiteRejectSchema = z.object({
  feedback: z.string().min(1).max(2000),
})

export type WebsiteRejectInput = z.infer<typeof WebsiteRejectSchema>
