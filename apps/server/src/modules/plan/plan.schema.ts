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

// The frontend already holds both candidates from the candidates_ready SSE
// event, so it sends them back rather than forcing a re-fetch. "auto" means
// the user deferred to the planner's own `recommended` pick.
export const PlanSelectSchema = z.object({
  choice: z.enum(["A", "B", "auto"]),
  candidateA: DesignBriefSchema,
  candidateB: DesignBriefSchema,
  recommended: z.enum(["A", "B"]),
})

export type PlanSelectInput = z.infer<typeof PlanSelectSchema>

export const PlanPdfSchema = z.object({
  sections: z
    .array(z.enum(["COMPETITOR_ANALYSIS", "RESEARCH_RATIONALE"]))
    .min(1, "Pick at least one report"),
  conversationId: z.string().cuid().optional(),
})

export type PlanPdfInput = z.infer<typeof PlanPdfSchema>
