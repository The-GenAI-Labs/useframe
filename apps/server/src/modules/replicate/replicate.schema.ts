import { z } from "zod"

export const ReplicateRequestSchema = z.object({
  url: z.string().url("Must be a valid URL"),
})

export type ReplicateRequestInput = z.infer<typeof ReplicateRequestSchema>
