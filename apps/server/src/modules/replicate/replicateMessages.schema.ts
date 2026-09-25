import { z } from "zod"

export const ReplicateMessageSchema = z.object({
  content: z.string().min(1).max(2000),
})

export type ReplicateMessageInput = z.infer<typeof ReplicateMessageSchema>
