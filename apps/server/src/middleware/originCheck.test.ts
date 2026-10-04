import { describe, expect, it, vi } from "vitest"
import type { NextFunction, Request, Response } from "express"

vi.mock("@/middleware/errorHandler.js", () => ({
  AppError: class extends Error {
    constructor(
      message: string,
      public statusCode: number,
    ) {
      super(message)
    }
  },
}))

const { requireAllowedOrigin } = await import("./originCheck.js")

function run(method: string, headers: Record<string, string>) {
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>
  const req = { method, get: (name: string) => headers[name.toLowerCase()] } as unknown as Request
  requireAllowedOrigin(["https://useframe.in"])(req, {} as Response, next)
  const arg = (next as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as { statusCode?: number } | undefined
  return arg?.statusCode ?? 200
}

describe("requireAllowedOrigin", () => {
  it("allows safe methods from anywhere", () => {
    expect(run("GET", { origin: "https://evil.useframe.in" })).toBe(200)
    expect(run("OPTIONS", {})).toBe(200)
  })

  it("allows the dashboard origin", () => {
    expect(run("POST", { origin: "https://useframe.in" })).toBe(200)
  })

  it("rejects a generated site on a sibling subdomain", () => {
    expect(run("POST", { origin: "https://acme-x7k.useframe.in" })).toBe(403)
  })

  it("falls back to Referer when Origin is absent", () => {
    expect(run("POST", { referer: "https://useframe.in/projects" })).toBe(200)
    expect(run("POST", { referer: "https://acme-x7k.useframe.in/" })).toBe(403)
  })

  it("rejects state-changing requests with neither header", () => {
    expect(run("POST", {})).toBe(403)
    expect(run("DELETE", { origin: "null" })).toBe(403)
  })
})
