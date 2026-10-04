import type { Request, Response } from "express"
import { authCookieName, authCookieOptions } from "@/lib/cookie.js"

const STATE_COOKIE = authCookieName("oauth_state")
const VERIFIER_COOKIE = authCookieName("oauth_code_verifier")
const MAX_AGE_MS = 5 * 60 * 1000

export function setOAuthStateCookies(
    res: Response,
    state: string,
    codeVerifier?: string
): void {
    res.cookie(STATE_COOKIE, state, { ...authCookieOptions("lax"), maxAge: MAX_AGE_MS })

    if (codeVerifier) {
        res.cookie(VERIFIER_COOKIE, codeVerifier, {
            ...authCookieOptions("lax"),
            maxAge: MAX_AGE_MS,
        })
    }
}

export function readOAuthStateCookies(req: Request): {
    state: string | undefined
    codeVerifier: string | undefined
} {
    return {
        state: req.cookies?.[STATE_COOKIE],
        codeVerifier: req.cookies?.[VERIFIER_COOKIE],
    }
}

export function clearOAuthStateCookies(res: Response): void {
    res.clearCookie(STATE_COOKIE, authCookieOptions("lax"))
    res.clearCookie(VERIFIER_COOKIE, authCookieOptions("lax"))
}
