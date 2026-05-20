import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import Resend from "next-auth/providers/resend"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@useframe/db"
import type { NextAuthConfig } from "next-auth"

export const authConfig: NextAuthConfig = {
    adapter: PrismaAdapter(prisma),

    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
        GitHub({
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        }),
        Resend({
            apiKey: process.env.RESEND_API_KEY!,
            from: process.env.EMAIL_FROM ?? "noreply@useframe.so",
        }),
    ],

    session: {
        strategy: "jwt",
    },

    pages: {
        signIn: "/login",
        verifyRequest: "/verify-request",
        error: "/auth-error",
    },

    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.id = user.id
                token.plan = (user as any).plan ?? "FREE"
            }
            return token
        },

        async session({ session, token }) {
            if (token && session.user) {
                session.user.id = token.id as string
                session.user.plan = token.plan as string
            }
            return session
        },

        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user
            const isProtected = nextUrl.pathname.startsWith("/dashboard")
            const isAuthRoute = ["/login", "/signup"].includes(nextUrl.pathname)

            if (isProtected && !isLoggedIn) return false
            if (isAuthRoute && isLoggedIn)
                return Response.redirect(new URL("/dashboard", nextUrl))

            return true
        },
    },
}

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig) 