import { z } from "zod"
import { CheckpointActionSchema, MEDIA_BUDGET_TIERS, StartJobSchema } from "@repo/media-ai"

export { CheckpointActionSchema, StartJobSchema }
export type { CheckpointAction, StartJobInput } from "@repo/media-ai"

export const AccountEstimateQuerySchema = z.object({ budget: z.enum(MEDIA_BUDGET_TIERS).default("STANDARD") })
