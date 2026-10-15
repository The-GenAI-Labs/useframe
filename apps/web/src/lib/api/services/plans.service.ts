import type { PublicPlan } from "@repo/schemas"
import { api } from "../axios"

export type { PublicPlan }

export const PLANS_QUERY_KEY = ["plans"] as const

export const plansApi = {
  list: async () => {
    const { data } = await api.get<{ success: true; data: PublicPlan[] }>("/plans")
    return data.data
  },
}

export function formatPlanPrice(plan: Pick<PublicPlan, "priceMinor" | "currency">): string {
  const amount = plan.priceMinor / 100
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: plan.currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount)
}
