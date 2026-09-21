import { api } from "../axios"

export type AutoReloadSetting = {
  enabled: boolean
  thresholdCents: number | null
  topUpToCents: number | null
}

export const billingApi = {
  // Either a fixed pack ({ packId }) or a custom amount ({ amountCents }) —
  // the server prices packs from its own table, so packId carries no amount.
  createCheckout: async (body: { packId: number } | { amountCents: number }) => {
    const { data } = await api.post<{
      success: true
      data: { clientSecret: string; credits: number }
    }>("/billing/checkout", body)
    return data.data
  },

  createSetupIntent: async () => {
    const { data } = await api.post<{ success: true; data: { clientSecret: string } }>(
      "/billing/payment-method"
    )
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
