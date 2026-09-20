import { z } from "zod"

export const SetPipelineModeSchema = z.object({
  mode: z.enum(["AUTO", "MANUAL"]),
})

export type SetPipelineModeInput = z.infer<typeof SetPipelineModeSchema>
