import { z } from "zod"
import { CUSTOM_MAX_AMOUNT_CENTS, CheckoutRequestSchema, type CheckoutRequest } from "@repo/schemas"

// A plan slug or a custom top-up amount; billing-service prices both from the server side.
export const CheckoutSchema = CheckoutRequestSchema

export type CheckoutInput = CheckoutRequest

export const AutoReloadSchema = z.object({
  enabled: z.boolean(),
  thresholdCents: z.number().int().positive(),
  topUpToCents: z
    .number()
    .int()
    .min(500, "Top-up amount must be at least $5")
    .max(CUSTOM_MAX_AMOUNT_CENTS, `Top-up amount can be at most $${CUSTOM_MAX_AMOUNT_CENTS / 100}`),
})

export type AutoReloadInput = z.infer<typeof AutoReloadSchema>
