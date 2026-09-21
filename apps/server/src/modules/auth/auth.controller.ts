import type { Request, Response, NextFunction } from "express"
import type { AuthenticatedRequest } from "@/types/index.js"
import { AuthService } from "./auth.service.js"
import { readOAuthStateCookies, clearOAuthStateCookies } from "./oauth.state.js"
import { env } from "@/config/env.js"
import type { MagicLinkInput, MagicLinkVerifyInput, ExchangeTicketInput } from "./auth.schema.js"

// Placeholder values ship in .env.example / are left unfilled in dev; zod's
// min(1) check lets them pass since it only checks for a non-empty string.
// Without this guard, clicking the button sends the user into a real OAuth
// provider that then rejects an invalid client_id — a dead end with no way
// back except manually editing the URL.
function isPlaceholderCredential(value: string): boolean {
    return value.startsWith("your-")
}

export const AuthController = {
    googleRedirect: (req: Request, res: Response): void => {
        if (isPlaceholderCredential(env.GOOGLE_CLIENT_ID)) {
            res.redirect(`${env.FRONTEND_URL}/signin?error=oauth_not_configured&provider=google`)
            return
        }
        const url = AuthService.getGoogleAuthUrl(res)
        res.redirect(url)
    },

    googleCallback: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const code = req.query.code as string | undefined
            const state = req.query.state as string | undefined
            const { state: storedState, codeVerifier } = readOAuthStateCookies(req)
            clearOAuthStateCookies(res)

            if (!code || !state) {
                res.redirect(`${env.FRONTEND_URL}/signin?error=oauth`)
                return
            }

            const { ticket } = await AuthService.handleGoogleCallback(
                code,
                state,
                storedState,
                codeVerifier
            )
            res.redirect(`${env.FRONTEND_URL}/auth/callback?ticket=${ticket}`)
        } catch (err) {
            console.error("[auth] Google callback failed:", err)
            res.redirect(`${env.FRONTEND_URL}/signin?error=oauth`)
        }
    },

    githubRedirect: (req: Request, res: Response): void => {
        if (isPlaceholderCredential(env.GITHUB_CLIENT_ID)) {
            res.redirect(`${env.FRONTEND_URL}/signin?error=oauth_not_configured&provider=github`)
            return
        }
        const url = AuthService.getGitHubAuthUrl(res)
        res.redirect(url)
    },

    githubCallback: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const code = req.query.code as string | undefined
            const state = req.query.state as string | undefined
            const { state: storedState } = readOAuthStateCookies(req)
            clearOAuthStateCookies(res)

            if (!code || !state) {
                res.redirect(`${env.FRONTEND_URL}/signin?error=oauth`)
                return
            }

            const { ticket } = await AuthService.handleGitHubCallback(code, state, storedState)
            res.redirect(`${env.FRONTEND_URL}/auth/callback?ticket=${ticket}`)
        } catch (err) {
            console.error("[auth] GitHub callback failed:", err)
            res.redirect(`${env.FRONTEND_URL}/signin?error=oauth`)
        }
    },

    exchangeTicket: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { ticket, attribution, deviceFingerprint } = req.body as ExchangeTicketInput
            const result = await AuthService.exchangeTicket(ticket, res, attribution ?? undefined, {
                ip: req.ip ?? "unknown",
                deviceFingerprint,
            })
            res.status(200).json({ success: true, message: "Signed in", data: result })
        } catch (err) {
            next(err)
        }
    },

    magicLink: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { email, turnstileToken, acceptedTerms, attribution, deviceFingerprint } =
                req.body as MagicLinkInput
            await AuthService.sendMagicLink(
                email,
                turnstileToken,
                acceptedTerms,
                attribution ?? undefined,
                req.ip,
                deviceFingerprint
            )
            res.status(200).json({ success: true, message: "Sign-in link sent" })
        } catch (err) {
            next(err)
        }
    },

    magicLinkVerify: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { token } = req.body as MagicLinkVerifyInput
            const result = await AuthService.verifyMagicLink(token, res)
            res.status(200).json({ success: true, message: "Signed in", data: result })
        } catch (err) {
            next(err)
        }
    },

    refresh: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const rawToken = req.cookies?.refresh_token
            const result = await AuthService.rotateRefreshToken(rawToken, res)
            res.status(200).json({ success: true, message: "Token refreshed", data: result })
        } catch (err) {
            next(err)
        }
    },

    logout: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const rawToken = req.cookies?.refresh_token
            await AuthService.logout(rawToken, res)
            res.status(200).json({ success: true, message: "Logged out successfully" })
        } catch (err) {
            next(err)
        }
    },

    checkEmail: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            const email = typeof req.query.email === "string" ? req.query.email : ""
            const exists = email ? await AuthService.checkEmailExists(email) : false
            res.status(200).json({ success: true, message: "OK", data: { exists } })
        } catch (err) {
            next(err)
        }
    },

    me: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const user = await AuthService.getMe(req.user!.id)
            res.status(200).json({ success: true, message: "User fetched", data: { user } })
        } catch (err) {
            next(err)
        }
    },
}
