import type { Response } from "express"
import { env } from "@/config/env.js"

const isProd = env.NODE_ENV === "production"

// must match REFRESH_TOKEN_TTL_MS in auth.service.ts
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000

export const setRefreshTokenCookie = (res: Response, token: string): void => {
    res.cookie("refresh_token", token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
        path: "/api/auth",
    })
}

export const clearRefreshTokenCookie = (res: Response): void => {
    res.clearCookie("refresh_token", {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        path: "/api/auth",
    })
}