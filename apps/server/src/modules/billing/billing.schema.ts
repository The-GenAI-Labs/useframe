import { z } from "zod"

export const CheckoutSchema = z.object({
  // Either a fixed pack (packId = the pack's amountCents) or a custom
  // amount. billing-service is the authority on both the pack table and the
  // custom minimum, so this layer just forwards rather than duplicating the
  // pricing rules.
  packId: z.number().int().optional(),
  amountCents: z.number().int().optional(),
})

export type CheckoutInput = z.infer<typeof CheckoutSchema>

export const AutoReloadSchema = z.object({
  enabled: z.boolean(),
  thresholdCents: z.number().int().positive(),
  topUpToCents: z.number().int().min(500, "Top-up amount must be at least $5"),
})

export type AutoReloadInput = z.infer<typeof AutoReloadSchema>
