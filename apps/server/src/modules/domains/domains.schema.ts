import { z } from "zod"

export const AddDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i, "Must be a valid domain name"),
})

export type AddDomainInput = z.infer<typeof AddDomainSchema>
