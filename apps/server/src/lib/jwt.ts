import jwt from "jsonwebtoken"
import { env } from "@/config/env.js"
import type { JWTPayload } from "@/types/index.js"

export const signAccessToken = (payload: Omit<JWTPayload, "type">): string => {
    return jwt.sign(
        { ...payload, type: "access" },
        env.JWT_ACCESS_SECRET,
        { expiresIn: env.JWT_ACCESS_EXPIRY }
    )
}

export const signRefreshToken = (payload: Omit<JWTPayload, "type">): string => {
    return jwt.sign(
        { ...payload, type: "refresh" },
        env.JWT_REFRESH_SECRET,
        { expiresIn: env.JWT_REFRESH_EXPIRY }
    )
}

export const verifyAccessToken = (token: string): JWTPayload => {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as JWTPayload
}

export const verifyRefreshToken = (token: string): JWTPayload => {
    return jwt.verify(token, env.JWT_REFRESH_SECRET) as JWTPayload
}