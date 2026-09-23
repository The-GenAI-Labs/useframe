"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

export type AuthUser = {
    id: string;
    email: string;
    name: string | null;
    image?: string | null;
    avatarUrl?: string | null;
    plan: string;
};

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
    user: AuthUser | null;
    status: AuthStatus;
    accessToken: string | null;
    login: (accessToken: string, user: AuthUser) => void;
    logout: () => Promise<void>;
    refresh: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Non-hook accessor for code outside React's render (e.g. SSE/fetch helpers
// that need the current token but aren't components themselves).
let currentAccessToken: string | null = null;
export function getCurrentAccessToken(): string | null {
    return currentAccessToken;
}

let refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
    if (!refreshInFlight) {
        refreshInFlight = fetch(`${API_SERVICE_URL}/api/auth/refresh`, {
            method: "POST",
            credentials: "include",
        })
            .then(async (res) => {
                if (!res.ok) return null;
                const body = await res.json();
                const token: string | undefined = body?.data?.accessToken;
                if (!token) return null;
                currentAccessToken = token;
                return token;
            })
            .catch(() => null)
            .finally(() => {
                refreshInFlight = null;
            });
    }
    return refreshInFlight;
}

export async function fetchWithAuthRetry(
    input: string,
    init: RequestInit = {},
): Promise<Response> {
    const attempt = async (): Promise<Response> => {
        const token = getCurrentAccessToken() ?? "";
        return fetch(input, {
            ...init,
            headers: { ...init.headers, Authorization: `Bearer ${token}` },
        });
    };

    const res = await attempt();
    if (res.status !== 401) return res;

    const newToken = await refreshAccessToken();
    if (!newToken) return res;

    return attempt();
}

const SKIP_MOUNT_REFRESH_PREFIXES = ["/auth/callback", "/auth/verify", "/signin"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const skipMountRefresh = SKIP_MOUNT_REFRESH_PREFIXES.some((p) => pathname?.startsWith(p));

    const [user, setUser] = useState<AuthUser | null>(null);
    const [status, setStatus] = useState<AuthStatus>(skipMountRefresh ? "unauthenticated" : "loading");
    const accessTokenRef = useRef<string | null>(null);
    const [, forceRender] = useState(0);

    const setAccessToken = useCallback((token: string | null) => {
        accessTokenRef.current = token;
        currentAccessToken = token;
        forceRender((n) => n + 1);
    }, []);

    const login = useCallback(
        (accessToken: string, nextUser: AuthUser) => {
            setAccessToken(accessToken);
            setUser(nextUser);
            setStatus("authenticated");
        },
        [setAccessToken]
    );

    const refresh = useCallback(async (): Promise<string | null> => {
        const token = await refreshAccessToken();
        if (token) setAccessToken(token);
        return token;
    }, [setAccessToken]);

    const logout = useCallback(async () => {
        try {
            await fetch(`${API_SERVICE_URL}/api/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } catch {
            // best-effort — clear local state regardless
        }
        setAccessToken(null);
        setUser(null);
        setStatus("unauthenticated");
    }, [setAccessToken]);

    useEffect(() => {
        if (skipMountRefresh) return;

        let cancelled = false;

        (async () => {
            const token = await refresh();
            if (cancelled) return;

            if (!token) {
                setStatus("unauthenticated");
                return;
            }

            try {
                const res = await fetch(`${API_SERVICE_URL}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (cancelled) return;
                if (!res.ok) {
                    setAccessToken(null);
                    setStatus("unauthenticated");
                    return;
                }
                const body = await res.json();
                setUser(body?.data?.user ?? null);
                setStatus("authenticated");
            } catch {
                if (!cancelled) {
                    setAccessToken(null);
                    setStatus("unauthenticated");
                }
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                status,
                accessToken: accessTokenRef.current,
                login,
                logout,
                refresh,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
