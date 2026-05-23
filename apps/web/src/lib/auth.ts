import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@useframe/db"
import { authConfig } from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    adapter: PrismaAdapter(prisma),
    callbacks: {
        ...authConfig.callbacks,

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
    },
})