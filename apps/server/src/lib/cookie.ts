import type { Response } from "express"
import { env } from "@/config/env.js"

const isProd = env.NODE_ENV === "production"

export const setRefreshTokenCookie = (res: Response, token: string): void => {
    res.cookie("refresh_token", token, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "strict" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
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