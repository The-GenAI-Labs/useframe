import { api } from "../axios"

export type AutoReloadSetting = {
  enabled: boolean
  thresholdCents: number | null
  topUpToCents: number | null
}

export const billingApi = {
  // A plan slug or a custom top-up amount. The server prices both; a plan
  // purchase sends no amount at all.
  createCheckout: async (body: { planSlug: string } | { amountCents: number }) => {
    const { data } = await api.post<{
      success: true
      data: {
        orderId: string
        keyId: string
        amountCents: number
        currency: string
        credits: number
        planSlug: string | null
      }
    }>("/billing/checkout", body)
    return data.data
  },

  // Razorpay has no SetupIntent — saving a card runs a minimal authorization
  // order, so this returns an order too.
  createSetupIntent: async () => {
    const { data } = await api.post<{
      success: true
      data: {
        orderId: string
        keyId: string
        customerId: string
        amountCents: number
        currency: string
      }
    }>("/billing/payment-method")
    return data.data
  },

  getAutoReload: async () => {
    const { data } = await api.get<{ success: true; data: AutoReloadSetting }>(
      "/billing/auto-reload"
    )
    return data.data
  },

  putAutoReload: async (input: { enabled: boolean; thresholdCents: number; topUpToCents: number }) => {
    const { data } = await api.put<{ success: true; data: AutoReloadSetting }>(
      "/billing/auto-reload",
      input
    )
    return data.data
  },
}
