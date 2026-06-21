import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ["/"];

const AUTH_ROUTES = ["/signin", "/verify-request", "/auth-error"];

const STATIC_FILE = /\.(png|jpe?g|gif|svg|webp|ico|mp4|webm|woff2?)$/i;

export default auth((req) => {
    const { nextUrl } = req;
    const isLoggedIn = !!req.auth?.user;
    const path = nextUrl.pathname;

    if (STATIC_FILE.test(path)) {
        return NextResponse.next();
    }

    const isPublic = PUBLIC_ROUTES.includes(path);
    const isAuthRoute = AUTH_ROUTES.some((r) => path.startsWith(r));

    if (isAuthRoute && isLoggedIn) {
        return NextResponse.redirect(new URL("/", nextUrl));
    }

    if (isPublic || isAuthRoute) {
        return NextResponse.next();
    }

    if (!isLoggedIn) {
        const signinUrl = new URL("/signin", nextUrl);
        signinUrl.searchParams.set("callbackUrl", path);
        return NextResponse.redirect(signinUrl);
    }

    return NextResponse.next();
});

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
