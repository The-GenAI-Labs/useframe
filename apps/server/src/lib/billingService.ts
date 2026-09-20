import { env } from "@/config/env.js"
import { AppError } from "@/middleware/errorHandler.js"

export type CreateCheckoutResult = { clientSecret: string; credits: number }
export type CreateSetupIntentResult = { clientSecret: string }
export type AutoReloadSettingResult = {
  enabled: boolean
  thresholdCents: number | null
  topUpToCents: number | null
}

async function billingFetch<T>(
  user: { id: string; email: string },
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${env.BILLING_SERVICE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": user.id,
      "X-User-Email": user.email,
      ...init?.headers,
    },
  })

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; message: string }
    | null

  if (!res.ok || !body?.success) {
    const message = body && "message" in body ? body.message : "Billing service request failed"
    throw new AppError(message, res.status >= 400 && res.status < 500 ? res.status : 502)
  }

  return body.data
}

export function callCreateCheckout(
  user: { id: string; email: string },
  amountCents: number
): Promise<CreateCheckoutResult> {
  return billingFetch<CreateCheckoutResult>(user, "/checkout/create-order", {
    method: "POST",
    body: JSON.stringify({ amountCents }),
  })
}

export function callCreateSetupIntent(user: {
  id: string
  email: string
}): Promise<CreateSetupIntentResult> {
  return billingFetch<CreateSetupIntentResult>(user, "/payment-methods/setup-intent", {
    method: "POST",
  })
}

export function callGetAutoReload(user: {
  id: string
  email: string
}): Promise<AutoReloadSettingResult> {
  return billingFetch<AutoReloadSettingResult>(user, "/auto-reload")
}

export function callPutAutoReload(
  user: { id: string; email: string },
  input: { enabled: boolean; thresholdCents: number; topUpToCents: number }
): Promise<AutoReloadSettingResult> {
  return billingFetch<AutoReloadSettingResult>(user, "/auto-reload", {
    method: "PUT",
    body: JSON.stringify(input),
  })
}
