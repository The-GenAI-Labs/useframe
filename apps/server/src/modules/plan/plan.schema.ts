import { z } from "zod"
import { DesignBriefSchema } from "@repo/schemas"

export const PlanUpdateSchema = z.object({
  brief: DesignBriefSchema,
})

export type PlanUpdateInput = z.infer<typeof PlanUpdateSchema>

export const PlanGenerateSchema = z.object({
  feedback: z.string().max(2000).optional(),
})

export type PlanGenerateInput = z.infer<typeof PlanGenerateSchema>

export const PlanRejectSchema = z.object({
  feedback: z.string().min(1).max(2000),
})

export type PlanRejectInput = z.infer<typeof PlanRejectSchema>
