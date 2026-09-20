import { z } from "zod"

// No request body needed today — authorize acts purely on the authenticated
// user's own state (hasUsedFreeGeneration / credit balance). Kept as an
// empty schema (rather than skipping validation) so a body can be added
// later without changing the route wiring.
export const AuthorizeGenerateSchema = z.object({})

export type AuthorizeGenerateInput = z.infer<typeof AuthorizeGenerateSchema>
