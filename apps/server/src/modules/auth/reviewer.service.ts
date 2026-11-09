import crypto from "node:crypto"
import type { Response } from "express"
import { prisma } from "@useframe/db"
import { env } from "@/config/env.js"
import { comparePassword } from "@/lib/password.js"
import { checkAndIncrement } from "@/middleware/rateLimit.js"
import { AppError } from "@/middleware/errorHandler.js"
import { AuthService } from "./auth.service.js"

const ATTEMPT_LIMIT = 5
const ATTEMPT_WINDOW_SECONDS = 15 * 60
const RATE_LIMITED_MESSAGE = "Too many sign-in attempts. Please try again later."
const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password"
export const REVIEWER_GRANT_REF_TYPE = "REVIEWER_GRANT"
const NO_EXPIRY = new Date("2099-01-01T00:00:00Z")

export type ReviewerAttemptContext = { ip: string; userAgent?: string }

type AuditOutcome = "success" | "invalid_credentials" | "rate_limited" | "error"

function audit(
    outcome: AuditOutcome,
    email: string,
    ctx: ReviewerAttemptContext,
    extra: { userId?: string; creditsGranted?: number } = {}
): void {
    console.info(
        JSON.stringify({
            audit: "auth.reviewer_login",
            outcome,
            email,
            ip: ctx.ip,
            userAgent: ctx.userAgent?.slice(0, 256),
            ...extra,
            at: new Date().toISOString(),
        })
    )
}

function digest(value: string): Buffer {
    return crypto.createHash("sha256").update(value).digest()
}

async function consumeAttempt(email: string, ctx: ReviewerAttemptContext, res: Response): Promise<void> {
    try {
        for (const key of [`ip:${ctx.ip}`, `email:${digest(email).toString("hex")}`]) {
            await checkAndIncrement(
                `ratelimit:reviewer-login:${key}`,
                ATTEMPT_LIMIT,
                ATTEMPT_WINDOW_SECONDS,
                RATE_LIMITED_MESSAGE,
                res
            )
        }
    } catch (err) {
        if (err instanceof AppError && err.statusCode === 429) audit("rate_limited", email, ctx)
        throw err
    }
}

async function credentialsMatch(email: string, password: string): Promise<boolean> {
    // bcrypt runs for every email so a wrong email costs the same time as a wrong password.
    const passwordMatches = await comparePassword(password, env.REVIEWER_PASSWORD_HASH)
    const emailMatches = crypto.timingSafeEqual(digest(email), digest(env.REVIEWER_EMAIL))
    return emailMatches && passwordMatches
}

export async function grantStartingCredits(userId: string, amount: number): Promise<number> {
    if (amount <= 0) return 0
    return prisma.$transaction(async (tx) => {
        // Row lock serialises concurrent first logins so the grant lands once.
        await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`
        const existing = await tx.creditTransaction.findFirst({
            where: { userId, refType: REVIEWER_GRANT_REF_TYPE },
            select: { id: true },
        })
        if (existing) return 0

        const balance = await tx.creditBalance.upsert({
            where: { userId },
            create: { userId, balance: amount, periodEnd: NO_EXPIRY },
            update: { balance: { increment: amount } },
            select: { balance: true },
        })
        await tx.creditTransaction.create({
            data: {
                userId,
                delta: amount,
                type: "ADJUSTMENT",
                reason: "Payment provider reviewer starting credits",
                balanceAfter: balance.balance,
                refType: REVIEWER_GRANT_REF_TYPE,
                refId: userId,
            },
        })
        return amount
    })
}

export const ReviewerAuthService = {
    async login(email: string, password: string, ctx: ReviewerAttemptContext, res: Response) {
        await consumeAttempt(email, ctx, res)

        if (!(await credentialsMatch(email, password))) {
            audit("invalid_credentials", email, ctx)
            throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401)
        }

        try {
            const user = await AuthService.findOrCreateEmailUser(env.REVIEWER_EMAIL, { ip: ctx.ip })
            const creditsGranted = await grantStartingCredits(user.id, env.REVIEWER_STARTING_CREDITS)
            const { accessToken } = await AuthService.issueSession(user, res)
            audit("success", email, ctx, { userId: user.id, creditsGranted })
            return { accessToken, user }
        } catch (err) {
            audit("error", email, ctx)
            throw err
        }
    },
}
