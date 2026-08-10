import "server-only"
import jwt from "jsonwebtoken"
import { auth } from "@/lib/auth"

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET!
const JWT_ACCESS_EXPIRY = "15m"

/**
 * apps/server and apps/orchestrator-service verify a JWT_ACCESS_SECRET-signed
 * token, not the NextAuth session cookie. This mints that token from the
 * current NextAuth session so the browser can call those services directly.
 */
export async function getBridgeToken(): Promise<string | null> {
    const session = await auth()
    if (!session?.user?.id || !session.user.email) return null

    return jwt.sign(
        {
            id: session.user.id,
            email: session.user.email,
            plan: (session.user as { plan?: string }).plan ?? "FREE",
            type: "access",
        },
        JWT_ACCESS_SECRET,
        { expiresIn: JWT_ACCESS_EXPIRY }
    )
}
