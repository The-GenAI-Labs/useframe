import crypto from "node:crypto"
import { Google, GitHub, generateState, generateCodeVerifier, OAuth2RequestError } from "arctic"
import type { Response } from "express"
import { prisma } from "@useframe/db"
import { signAccessToken } from "@/lib/jwt.js"
import { setRefreshTokenCookie, clearRefreshTokenCookie } from "@/lib/cookie.js"
import { setOAuthStateCookies, clearOAuthStateCookies } from "./oauth.state.js"
import { AppError } from "@/middleware/errorHandler.js"
import { env } from "@/config/env.js"

const google = new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI)
const github = new GitHub(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, env.GITHUB_REDIRECT_URI)

const TICKET_TTL_MS = 30 * 1000
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_TTL_MS = REFRESH_TOKEN_TTL_MS
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000

function hashToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex")
}

function generateRawToken(): string {
    return crypto.randomBytes(32).toString("hex")
}

type SafeUser = {
    id: string
    name: string | null
    avatarUrl: string | null
    email: string
}

/**
 * Login = an Identity row. Same email across providers links to the
 * same User (Identity.email is the linking key), so a Google sign-in
 * from someone who first signed up via magic link lands on one account.
 */
async function findOrCreateUserByIdentity(
    type: "EMAIL" | "GOOGLE" | "GITHUB",
    externalId: string,
    email: string,
    name: string | null,
    avatarUrl: string | null
): Promise<SafeUser> {
    const existingIdentity = await prisma.identity.findUnique({
        where: { type_externalId: { type, externalId } },
        select: { user: { select: { id: true, name: true, avatarUrl: true } } },
    })

    if (existingIdentity) {
        return { ...existingIdentity.user, email }
    }

    const linkedIdentity = await prisma.identity.findFirst({
        where: { email },
        select: { userId: true },
        orderBy: { createdAt: "asc" },
    })

    if (linkedIdentity) {
        const user = await prisma.user.update({
            where: { id: linkedIdentity.userId },
            data: {
                name: name ?? undefined,
                avatarUrl: avatarUrl ?? undefined,
            },
            select: { id: true, name: true, avatarUrl: true },
        })

        await prisma.identity.create({
            data: {
                userId: user.id,
                type,
                externalId,
                email,
                verifiedAt: new Date(),
            },
        })

        return { ...user, email }
    }

    const user = await prisma.user.create({
        data: {
            name,
            avatarUrl,
            identities: {
                create: {
                    type,
                    externalId,
                    email,
                    isPrimary: true,
                    verifiedAt: new Date(),
                },
            },
        },
        select: { id: true, name: true, avatarUrl: true },
    })

    return { ...user, email }
}

async function issueTokenPair(
    user: SafeUser,
    res: Response,
    meta?: { userAgent?: string; ip?: string }
): Promise<{ accessToken: string }> {
    const accessToken = signAccessToken({ id: user.id, email: user.email, plan: "FREE" })

    const session = await prisma.session.create({
        data: {
            userId: user.id,
            userAgent: meta?.userAgent,
            ip: meta?.ip,
            expiresAt: new Date(Date.now() + SESSION_TTL_MS),
        },
    })

    const rawRefreshToken = generateRawToken()
    const tokenHash = hashToken(rawRefreshToken)

    await prisma.refreshToken.create({
        data: {
            sessionId: session.id,
            userId: user.id,
            tokenHash,
            familyId: crypto.randomUUID(),
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
    })

    setRefreshTokenCookie(res, rawRefreshToken)

    return { accessToken }
}

async function getPrimaryEmail(userId: string): Promise<string> {
    const identity = await prisma.identity.findFirst({
        where: { userId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { email: true },
    })
    if (!identity) throw new AppError("User has no linked identity", 404)
    return identity.email
}

export const AuthService = {
    getGoogleAuthUrl(res: Response): string {
        const state = generateState()
        const codeVerifier = generateCodeVerifier()
        const url = google.createAuthorizationURL(state, codeVerifier, [
            "openid",
            "profile",
            "email",
        ])
        setOAuthStateCookies(res, state, codeVerifier)
        return url.toString()
    },

    getGitHubAuthUrl(res: Response): string {
        const state = generateState()
        const url = github.createAuthorizationURL(state, ["user:email"])
        setOAuthStateCookies(res, state)
        return url.toString()
    },

    async handleGoogleCallback(
        code: string,
        state: string,
        storedState: string | undefined,
        codeVerifier: string | undefined
    ): Promise<{ ticket: string }> {
        if (!storedState || state !== storedState || !codeVerifier) {
            throw new AppError("Invalid OAuth state", 401)
        }

        let tokens
        try {
            tokens = await google.validateAuthorizationCode(code, codeVerifier)
        } catch (err) {
            if (err instanceof OAuth2RequestError) {
                throw new AppError("Google authorization failed", 401)
            }
            console.error("[auth] Google token exchange failed:", err)
            throw new AppError("Failed to complete Google sign-in", 502)
        }

        const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
            headers: { Authorization: `Bearer ${tokens.accessToken()}` },
        })
        if (!userInfoRes.ok) throw new AppError("Failed to fetch Google profile", 502)

        const profile = (await userInfoRes.json()) as {
            sub: string
            email: string
            name?: string
            picture?: string
        }

        const user = await findOrCreateUserByIdentity(
            "GOOGLE",
            profile.sub,
            profile.email,
            profile.name ?? null,
            profile.picture ?? null
        )

        return this.issueTicket(user.id)
    },

    async handleGitHubCallback(
        code: string,
        state: string,
        storedState: string | undefined
    ): Promise<{ ticket: string }> {
        if (!storedState || state !== storedState) {
            throw new AppError("Invalid OAuth state", 401)
        }

        let tokens
        try {
            tokens = await github.validateAuthorizationCode(code)
        } catch (err) {
            if (err instanceof OAuth2RequestError) {
                throw new AppError("GitHub authorization failed", 401)
            }
            throw new AppError("Failed to complete GitHub sign-in", 502)
        }

        const userRes = await fetch("https://api.github.com/user", {
            headers: { Authorization: `Bearer ${tokens.accessToken()}` },
        })
        if (!userRes.ok) throw new AppError("Failed to fetch GitHub profile", 502)

        const profile = (await userRes.json()) as {
            id: number
            login: string
            name: string | null
            avatar_url: string | null
            email: string | null
        }

        let email = profile.email
        if (!email) {
            const emailsRes = await fetch("https://api.github.com/user/emails", {
                headers: { Authorization: `Bearer ${tokens.accessToken()}` },
            })
            if (emailsRes.ok) {
                const emails = (await emailsRes.json()) as {
                    email: string
                    primary: boolean
                    verified: boolean
                }[]
                email = emails.find((e) => e.primary)?.email ?? emails[0]?.email ?? null
            }
        }

        if (!email) {
            throw new AppError("GitHub account has no accessible email address", 400)
        }

        const user = await findOrCreateUserByIdentity(
            "GITHUB",
            String(profile.id),
            email,
            profile.name ?? profile.login,
            profile.avatar_url
        )

        return this.issueTicket(user.id)
    },

    async issueTicket(userId: string): Promise<{ ticket: string }> {
        const rawTicket = generateRawToken()
        await prisma.ticketToken.create({
            data: {
                userId,
                tokenHash: hashToken(rawTicket),
                expiresAt: new Date(Date.now() + TICKET_TTL_MS),
            },
        })
        return { ticket: rawTicket }
    },

    async exchangeTicket(rawTicket: string, res: Response) {
        const tokenHash = hashToken(rawTicket)
        const ticket = await prisma.ticketToken.findUnique({ where: { tokenHash } })

        if (!ticket || ticket.usedAt || ticket.expiresAt < new Date()) {
            throw new AppError("Invalid or expired ticket", 401)
        }

        await prisma.ticketToken.update({
            where: { id: ticket.id },
            data: { usedAt: new Date() },
        })

        const user = await prisma.user.findUnique({
            where: { id: ticket.userId },
            select: { id: true, name: true, avatarUrl: true },
        })
        if (!user) throw new AppError("User not found", 404)

        const email = await getPrimaryEmail(user.id)
        const { accessToken } = await issueTokenPair({ ...user, email }, res)
        return { accessToken, user: { ...user, email } }
    },

    async sendMagicLink(email: string): Promise<void> {
        const rawToken = generateRawToken()
        await prisma.magicLinkToken.create({
            data: {
                email,
                tokenHash: hashToken(rawToken),
                expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
            },
        })

        const link = `${env.FRONTEND_URL}/auth/verify?token=${rawToken}`

        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: env.EMAIL_FROM,
                to: email,
                subject: "Sign in to UseFrame",
                html: `<p>Click the link below to sign in:</p><p><a href="${link}">${link}</a></p><p>This link expires in 15 minutes.</p>`,
            }),
        })

        if (!res.ok) {
            const body = await res.text().catch((e) => `<failed to read body: ${e}>`)
            console.error("[auth] Resend send failed:", res.status, body)
            throw new AppError("Failed to send sign-in email", 502)
        }
    },

    async verifyMagicLink(rawToken: string, res: Response) {
        const tokenHash = hashToken(rawToken)
        const record = await prisma.magicLinkToken.findUnique({ where: { tokenHash } })

        if (!record || record.consumedAt || record.expiresAt < new Date()) {
            throw new AppError("Invalid or expired sign-in link", 401)
        }

        await prisma.magicLinkToken.update({
            where: { id: record.id },
            data: { consumedAt: new Date() },
        })

        const user = await findOrCreateUserByIdentity(
            "EMAIL",
            record.email,
            record.email,
            null,
            null
        )

        const { accessToken } = await issueTokenPair(user, res)
        return { accessToken, user }
    },

    async rotateRefreshToken(rawToken: string | undefined, res: Response) {
        if (!rawToken) throw new AppError("No refresh token", 401)

        const tokenHash = hashToken(rawToken)
        const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } })

        if (!existing) {
            throw new AppError("Invalid refresh token", 401)
        }

        if (existing.revokedAt) {
            await prisma.refreshToken.deleteMany({ where: { familyId: existing.familyId } })
            clearRefreshTokenCookie(res)
            throw new AppError("Refresh token reuse detected, please sign in again", 401)
        }

        if (existing.expiresAt < new Date()) {
            clearRefreshTokenCookie(res)
            throw new AppError("Refresh token expired", 401)
        }

        const user = await prisma.user.findUnique({
            where: { id: existing.userId },
            select: { id: true, name: true, avatarUrl: true },
        })
        if (!user) throw new AppError("User not found", 401)

        const email = await getPrimaryEmail(user.id)
        const rawNewToken = generateRawToken()

        await prisma.$transaction([
            prisma.refreshToken.update({
                where: { id: existing.id },
                data: { revokedAt: new Date() },
            }),
            prisma.refreshToken.create({
                data: {
                    sessionId: existing.sessionId,
                    userId: user.id,
                    tokenHash: hashToken(rawNewToken),
                    familyId: existing.familyId,
                    parentId: existing.id,
                    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
                },
            }),
            prisma.session.update({
                where: { id: existing.sessionId },
                data: { lastActiveAt: new Date() },
            }),
        ])

        const accessToken = signAccessToken({ id: user.id, email, plan: "FREE" })
        setRefreshTokenCookie(res, rawNewToken)

        return { accessToken }
    },

    async logout(rawToken: string | undefined, res: Response): Promise<void> {
        if (rawToken) {
            const tokenHash = hashToken(rawToken)
            const existing = await prisma.refreshToken
                .findUnique({ where: { tokenHash } })
                .catch(() => null)

            if (existing) {
                await prisma.$transaction([
                    prisma.refreshToken.updateMany({
                        where: { tokenHash, revokedAt: null },
                        data: { revokedAt: new Date() },
                    }),
                    prisma.session.update({
                        where: { id: existing.sessionId },
                        data: { revokedAt: new Date() },
                    }),
                ]).catch(() => {})
            }
        }
        clearRefreshTokenCookie(res)
        clearOAuthStateCookies(res)
    },

    async checkEmailExists(email: string): Promise<boolean> {
        const identity = await prisma.identity.findFirst({
            where: { email },
            select: { id: true },
        })
        return !!identity
    },

    async getMe(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId, deletedAt: null },
            select: {
                id: true,
                name: true,
                avatarUrl: true,
                createdAt: true,
            },
        })

        if (!user) throw new AppError("User not found", 404)

        const email = await getPrimaryEmail(user.id)

        return { ...user, email, plan: "FREE" as const }
    },
}
