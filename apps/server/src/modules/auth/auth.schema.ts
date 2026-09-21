import { z } from "zod"

// Attribution is optional and best-effort — captured client-side from
// ?ref / utm_* query params (see lib/attribution.ts in apps/web) and only
// ever applied the first time a User row is created, never overwritten.
const attributionSchema = z.object({
    referralSource: z.string().trim().max(255).nullish(),
    utmSource: z.string().trim().max(255).nullish(),
    utmMedium: z.string().trim().max(255).nullish(),
    utmCampaign: z.string().trim().max(255).nullish(),
})

// Client-side device fingerprint (FingerprintJS visitorId) — best-effort
// signup risk signal, never required. See apps/web's lib/fingerprint.ts.
const deviceFingerprintSchema = z.string().trim().min(1).max(255).optional()

export const magicLinkSchema = z.object({
    email: z.string().email("Invalid email address").toLowerCase().trim(),
    turnstileToken: z.string().min(1, "Bot verification is required"),
    acceptedTerms: z.literal(true, {
        errorMap: () => ({ message: "You must accept the Terms of Service to continue" }),
    }),
    attribution: attributionSchema.optional(),
    deviceFingerprint: deviceFingerprintSchema,
})

// Consent/attribution/risk inputs are intentionally NOT accepted here — the
// link may be opened in a different tab/device than the one that requested
// it, so those values are read back from the MagicLinkToken row created in
// sendMagicLink instead of trusted from whatever client happens to hit this
// endpoint.
export const magicLinkVerifySchema = z.object({
    token: z.string().min(1, "Token is required"),
})

export const exchangeTicketSchema = z.object({
    ticket: z.string().min(1, "Ticket is required"),
    acceptedTerms: z.literal(true, {
        errorMap: () => ({ message: "You must accept the Terms of Service to continue" }),
    }),
    attribution: attributionSchema.optional(),
    deviceFingerprint: deviceFingerprintSchema,
})

export type MagicLinkInput = z.infer<typeof magicLinkSchema>
export type MagicLinkVerifyInput = z.infer<typeof magicLinkVerifySchema>
export type ExchangeTicketInput = z.infer<typeof exchangeTicketSchema>
