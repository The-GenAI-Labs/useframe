import { z } from "zod"

export const CreateSeoAuditSchema = z.object({
  url: z.string().url(),
  tier: z.enum(["free", "paid"]).default("free"),
})

export type CreateSeoAuditInput = z.infer<typeof CreateSeoAuditSchema>
