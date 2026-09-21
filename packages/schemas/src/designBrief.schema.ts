import { z } from "zod"
import { CitationSchema } from "./citation.schema.js"

export const DesignBriefSchema = z.object({
  product: z.string(),
  audience: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
  }),
  goal: z.string(),
  brand: z.object({
    personality: z.string(),
    positioning: z.string(),
    tone: z.string(),
  }),
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string(),
    rationale: z.string(),
    citation: z.string(),
  }),
  typography: z.object({
    primary: z.string(),
    secondary: z.string(),
    minSize: z.string(),
    rationale: z.string(),
    citation: z.string(),
  }),
  layout: z.object({
    sections: z.array(z.string()),
    rationale: z.string(),
    citation: z.string(),
  }),
  copyFramework: z.enum(["AIDA", "PAS", "FAB", "PASTOR"]),
  frameworkRationale: z.string(),
  density: z.string(),
  motion: z.string(),
  accessibility: z.object({
    minContrast: z.string(),
    touchTarget: z.string(),
  }),
  avoid: z.array(z.string()),
  citations: z.array(CitationSchema),
})

export type DesignBrief = z.infer<typeof DesignBriefSchema>

// The planner produces TWO genuinely distinct directions from the same
// research findings, plus its own pick. The user chooses A, B, or defers to
// `recommended` ("auto") — see PlanSelectSchema in project.schema.ts.
export const DesignBriefCandidatesSchema = z.object({
  candidateA: DesignBriefSchema,
  candidateB: DesignBriefSchema,
  recommended: z.enum(["A", "B"]),
  recommendedReason: z.string(),
})

export type DesignBriefCandidates = z.infer<typeof DesignBriefCandidatesSchema>
