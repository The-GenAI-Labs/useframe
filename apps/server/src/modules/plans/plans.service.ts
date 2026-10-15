import { prisma } from "@useframe/db"
import type { PublicPlan } from "@repo/schemas"

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [])

export const PlansService = {
  async listActive(): Promise<PublicPlan[]> {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: [{ rank: "asc" }, { priceMinor: "asc" }],
      select: { slug: true, name: true, description: true, priceMinor: true, currency: true, features: true, highlighted: true },
    })
    return plans.map((p) => ({ ...p, currency: p.currency.toUpperCase(), features: strings(p.features) }))
  },
}
