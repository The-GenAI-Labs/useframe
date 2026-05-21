import { prisma } from "@useframe/db"
import { hashPassword, comparePassword } from "@/lib/password.js"
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "@/lib/jwt.js"
import { setRefreshTokenCookie, clearRefreshTokenCookie } from "@/lib/cookie.js"
import { AppError } from "@/middleware/errorHandler.js"
import type { Response } from "express" 
import type { RegisterInput, LoginInput } from "./auth.schema.js"

export const AuthService = {

    // ── REGISTER ──────────────────────────────────────────────────────────────
    async register(input: RegisterInput, res: Response) {
        const { name, email, password } = input

        // check existing user
        const existing = await prisma.user.findUnique({
            where: { email },
        })

        if (existing) {
            throw new AppError("Email already in use", 409)
        }

        // hash password
        const hashedPassword = await hashPassword(password)

        // create user
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                plan: "FREE",
                isActive: true,
            },
            select: {
                id: true,
                name: true,
                email: true,
                plan: true,
                createdAt: true,
            },
        })

        // generate tokens
        const tokenPayload = { id: user.id, email: user.email, plan: user.plan }
        const accessToken = signAccessToken(tokenPayload)
        const refreshToken = signRefreshToken(tokenPayload)

        // set refresh token in httpOnly cookie
        setRefreshTokenCookie(res, refreshToken)

        return {
            user,
            accessToken,
        }
    },

    // ── LOGIN ─────────────────────────────────────────────────────────────────
    async login(input: LoginInput, res: Response) {
        const { email, password } = input

        // find user — include password for comparison
        const user = await prisma.user.findUnique({
            where: { email, deletedAt: null },
            select: {
                id: true,
                name: true,
                email: true,
                plan: true,
                password: true,
                isActive: true,
                createdAt: true,
            },
        })

        // generic error — don't reveal if email exists
        if (!user) {
            throw new AppError("Invalid email or password", 401)
        }

        if (!user.isActive) {
            throw new AppError("Account is deactivated", 403)
        }

        if (!user.password) {
            throw new AppError(
                "This account uses social login. Please sign in with Google or GitHub.",
                400
            )
        }

        const isValid = await comparePassword(password, user.password)

        if (!isValid) {
            throw new AppError("Invalid email or password", 401)
        }

        // generate tokens
        const tokenPayload = { id: user.id, email: user.email, plan: user.plan }
        const accessToken = signAccessToken(tokenPayload)
        const refreshToken = signRefreshToken(tokenPayload)

        // set refresh token cookie
        setRefreshTokenCookie(res, refreshToken)

        // return user without password
        const { password: _, ...safeUser } = user

        return {
            user: safeUser,
            accessToken,
        }
    },

    // ── REFRESH ───────────────────────────────────────────────────────────────
    async refresh(refreshToken: string, res: Response) {
        if (!refreshToken) {
            throw new AppError("No refresh token", 401)
        }

        // verify refresh token
        const payload = verifyRefreshToken(refreshToken)

        if (payload.type !== "refresh") {
            throw new AppError("Invalid token type", 401)
        }

        // verify user still exists and is active
        const user = await prisma.user.findUnique({
            where: { id: payload.id, deletedAt: null },
            select: { id: true, email: true, plan: true, isActive: true },
        })

        if (!user || !user.isActive) {
            throw new AppError("User not found or inactive", 401)
        }

        // issue new tokens
        const tokenPayload = { id: user.id, email: user.email, plan: user.plan }
        const newAccess = signAccessToken(tokenPayload)
        const newRefresh = signRefreshToken(tokenPayload)

        setRefreshTokenCookie(res, newRefresh)

        return { accessToken: newAccess }
    },

    // ── LOGOUT ────────────────────────────────────────────────────────────────
    async logout(res: Response) {
        clearRefreshTokenCookie(res)
    },

    // ── ME ────────────────────────────────────────────────────────────────────
    async getMe(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId, deletedAt: null },
            select: {
                id: true,
                name: true,
                email: true,
                plan: true,
                avatarUrl: true,
                createdAt: true,
            },
        })

        if (!user) {
            throw new AppError("User not found", 404)
        }

        return user
    },
}