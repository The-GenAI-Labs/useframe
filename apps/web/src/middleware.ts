import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"
export const runtime = 'nodejs';
const PROTECTED_ROUTES = ["/dashboard", "/projects", "/settings"]
const AUTH_ROUTES = ["/login", "/signup"]

export default auth((req) => {
    const { nextUrl, auth: session } = req
    const isLoggedIn = !!session?.user
    const path = nextUrl.pathname

    const isProtected = PROTECTED_ROUTES.some((r) => path.startsWith(r))
    const isAuthRoute = AUTH_ROUTES.includes(path)

    if (isProtected && !isLoggedIn) {
        return NextResponse.redirect(new URL("/login", nextUrl))
    }

    if (isAuthRoute && isLoggedIn) {
        return NextResponse.redirect(new URL("/dashboard", nextUrl))
    }

    return NextResponse.next()
})

export const config = {
    matcher: [
        "/((?!api|_next/static|_next/image|favicon.ico|auth|public).*)",
    ],
}