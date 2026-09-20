import { z } from "zod"

export const CheckoutSchema = z.object({
  amountCents: z.number().int().min(500, "Minimum top-up is $5"),
})

export type CheckoutInput = z.infer<typeof CheckoutSchema>

export const AutoReloadSchema = z.object({
  enabled: z.boolean(),
  thresholdCents: z.number().int().positive(),
  topUpToCents: z.number().int().min(500, "Top-up amount must be at least $5"),
})

export type AutoReloadInput = z.infer<typeof AutoReloadSchema>
