import { z } from "zod"

export const SnapshotTemplateParamSchema = z.object({
  template: z.enum(["base-vite", "base-nextjs"]),
})

export type SnapshotTemplateParam = z.infer<typeof SnapshotTemplateParamSchema>
