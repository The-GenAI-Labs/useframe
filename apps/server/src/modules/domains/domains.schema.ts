import { z } from "zod"

// Full hostname rules live in the deploy service; this only bounds the input.
export const AddDomainSchema = z.object({
  hostname: z.string().trim().min(1).max(300),
})

export type AddDomainInput = z.infer<typeof AddDomainSchema>
