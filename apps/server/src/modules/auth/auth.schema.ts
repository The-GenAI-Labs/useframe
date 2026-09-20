import { z } from "zod"

export const magicLinkSchema = z.object({
    email: z.string().email("Invalid email address").toLowerCase().trim(),
})

export const magicLinkVerifySchema = z.object({
    token: z.string().min(1, "Token is required"),
})

export const exchangeTicketSchema = z.object({
    ticket: z.string().min(1, "Ticket is required"),
})

export type MagicLinkInput = z.infer<typeof magicLinkSchema>
export type MagicLinkVerifyInput = z.infer<typeof magicLinkVerifySchema>
export type ExchangeTicketInput = z.infer<typeof exchangeTicketSchema>
