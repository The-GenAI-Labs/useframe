import type { Request, Response } from "express"
import { env } from "@/config/env.js"

const isProd = env.NODE_ENV === "production"
const STATE_COOKIE = "oauth_state"
const VERIFIER_COOKIE = "oauth_code_verifier"
const MAX_AGE_MS = 5 * 60 * 1000

export function setOAuthStateCookies(
    res: Response,
    state: string,
    codeVerifier?: string
): void {
    res.cookie(STATE_COOKIE, state, {
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: MAX_AGE_MS,
        path: "/api/auth",
    })

    if (codeVerifier) {
        res.cookie(VERIFIER_COOKIE, codeVerifier, {
            httpOnly: true,
            secure: isProd,
            sameSite: "lax",
            maxAge: MAX_AGE_MS,
            path: "/api/auth",
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
    res.clearCookie(STATE_COOKIE, { path: "/api/auth" })
    res.clearCookie(VERIFIER_COOKIE, { path: "/api/auth" })
}
