import { describe, expect, it, vi } from "vitest"

vi.mock("@/config/env.js", () => ({ env: { NODE_ENV: "production" } }))

const { authCookieName, authCookieOptions, REFRESH_TOKEN_COOKIE } = await import("./cookie.js")

describe("auth cookie options", () => {
  it("uses __Host- names in production", () => {
    expect(REFRESH_TOKEN_COOKIE).toBe("__Host-refresh_token")
    expect(authCookieName("oauth_state", true)).toBe("__Host-oauth_state")
    expect(authCookieName("oauth_code_verifier", true)).toBe("__Host-oauth_code_verifier")
  })

  it("keeps plain names outside production", () => {
    expect(authCookieName("refresh_token", false)).toBe("refresh_token")
  })

  it.each(["strict", "lax"] as const)("production %s options satisfy the __Host- rules", (sameSite) => {
    const options = authCookieOptions(sameSite, true)
    expect(options).not.toHaveProperty("domain")
    expect(options.path).toBe("/")
    expect(options.secure).toBe(true)
    expect(options.httpOnly).toBe(true)
  })

  it("never sets a Domain anywhere in the auth cookie code", async () => {
    const { readFile } = await import("node:fs/promises")
    const sources = await Promise.all(
      ["./cookie.ts", "../modules/auth/oauth.state.ts"].map((p) =>
        readFile(new URL(p, import.meta.url), "utf-8"),
      ),
    )
    for (const source of sources) {
      expect(source).not.toMatch(/\bdomain\s*:/i)
      expect(source).not.toMatch(/path:\s*"(?!\/")/)
    }
  })
})
