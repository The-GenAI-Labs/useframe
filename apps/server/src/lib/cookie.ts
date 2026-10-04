import type { CookieOptions, Request, Response } from "express"
import { env } from "@/config/env.js"

const isProd = env.NODE_ENV === "production"

// Generated sites live on sibling subdomains of the API, so in production
// every auth cookie is __Host- (Secure, Path=/, no Domain) to stop a site from
// planting its own. Plain names on localhost: Secure cookies over http break.
export function authCookieName(base: string, production: boolean = isProd): string {
    return production ? `__Host-${base}` : base
}

export function authCookieOptions(
    sameSite: "strict" | "lax",
    production: boolean = isProd
): CookieOptions {
    return { httpOnly: true, secure: production, sameSite, path: "/" }
}

export const REFRESH_TOKEN_COOKIE = authCookieName("refresh_token")

// must match REFRESH_TOKEN_TTL_MS in auth.service.ts
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000

export const setRefreshTokenCookie = (res: Response, token: string): void => {
    res.cookie(REFRESH_TOKEN_COOKIE, token, {
        ...authCookieOptions(isProd ? "strict" : "lax"),
        maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
    })
}

export const clearRefreshTokenCookie = (res: Response): void => {
    res.clearCookie(REFRESH_TOKEN_COOKIE, authCookieOptions(isProd ? "strict" : "lax"))
}

export const readRefreshTokenCookie = (req: Request): string | undefined =>
    req.cookies?.[REFRESH_TOKEN_COOKIE]
