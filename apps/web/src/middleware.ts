import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// routes that are always public regardless of session
const PUBLIC_ROUTES = ["/"];

// routes only accessible when logged out (redirect home if already authed)
const AUTH_ROUTES = ["/login", "/signup", "/verify-request", "/auth-error"];

export default auth((req) => {
    const { nextUrl } = req;
    const isLoggedIn = !!req.auth?.user;
    const path = nextUrl.pathname;

    const isPublic = PUBLIC_ROUTES.includes(path);
    const isAuthRoute = AUTH_ROUTES.some((r) => path.startsWith(r));

    if (isAuthRoute && isLoggedIn) {
        return NextResponse.redirect(new URL("/", nextUrl));
    }

    if (isPublic || isAuthRoute) {
        return NextResponse.next();
    }

    if (!isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl);
        loginUrl.searchParams.set("callbackUrl", path);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
