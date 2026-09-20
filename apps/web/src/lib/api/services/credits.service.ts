import { api } from "../axios"
import type { AutoReloadSetting } from "./billing.service"

export type CreditsSummary = {
  balance: number
  autoReload: AutoReloadSetting
}

export const creditsApi = {
  getSummary: async () => {
    const { data } = await api.get<{ success: true; data: CreditsSummary }>("/credits")
    return data.data
  },
}
