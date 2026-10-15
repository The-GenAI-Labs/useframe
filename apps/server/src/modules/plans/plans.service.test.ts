import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Request, Response } from "express"

type PlanRow = {
  slug: string
  name: string
  description: string | null
  priceMinor: number
  currency: string
  credits: number
  features: unknown
  highlighted: boolean
  isActive: boolean
  rank: number
}

const m = vi.hoisted(() => ({ plans: [] as PlanRow[] }))

// Honours the where/orderBy/select the service sends, so a missing filter fails the test.
vi.mock("@useframe/db", () => ({
  prisma: {
    plan: {
      findMany: async ({ where, orderBy, select }: { where: Partial<PlanRow>; orderBy: Record<string, "asc">[]; select: Record<string, true> }) =>
        m.plans
          .filter((p) => Object.entries(where).every(([k, v]) => p[k as keyof PlanRow] === v))
          .sort((a, b) => {
            for (const o of orderBy) {
              const [k] = Object.keys(o) as (keyof PlanRow)[]
              if (a[k!] !== b[k!]) return (a[k!] as number) - (b[k!] as number)
            }
            return 0
          })
          .map((p) => Object.fromEntries(Object.keys(select).map((k) => [k, p[k as keyof PlanRow]]))),
    },
  },
}))

const { PlansService } = await import("./plans.service.js")
const { PlansController } = await import("./plans.controller.js")

const plan = (overrides: Partial<PlanRow>): PlanRow => ({
  slug: "starter",
  name: "Starter",
  description: "One real site",
  priceMinor: 4900,
  currency: "USD",
  credits: 98,
  features: ["A", "B"],
  highlighted: false,
  isActive: true,
  rank: 1,
  ...overrides,
})

beforeEach(() => {
  m.plans = [
    plan({ slug: "agency", name: "Agency", priceMinor: 19900, rank: 3 }),
    plan({ slug: "retired", name: "Retired", priceMinor: 100, rank: 0, isActive: false }),
    plan({ slug: "starter", rank: 1 }),
    plan({ slug: "studio", name: "Studio", priceMinor: 9900, rank: 2, highlighted: true, features: ["x", 3, null] }),
  ]
})

describe("GET /api/plans", () => {
  it("returns active plans only, in display order, without internal fields", async () => {
    const plans = await PlansService.listActive()
    expect(plans.map((p) => p.slug)).toEqual(["starter", "studio", "agency"])
    expect(plans.some((p) => p.slug === "retired")).toBe(false)
    expect(Object.keys(plans[0]!).sort()).toEqual(["currency", "description", "features", "highlighted", "name", "priceMinor", "slug"])
    expect(plans[1]!.features).toEqual(["x"])
  })

  it("sets a short public cache", async () => {
    const headers: Record<string, string> = {}
    let body: unknown
    const res = {
      setHeader: (k: string, v: string) => void (headers[k] = v),
      status: () => res,
      json: (b: unknown) => void (body = b),
    } as unknown as Response
    await PlansController.list({} as Request, res, vi.fn())
    expect(headers["Cache-Control"]).toBe("public, max-age=60")
    expect((body as { data: { slug: string }[] }).data.map((p) => p.slug)).not.toContain("retired")
  })
})
