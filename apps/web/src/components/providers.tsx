"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { useRef } from "react";

// next-auth/react SessionProvider return type is incompatible with React 19 JSX (missing children in ReactPortal).
// Cast to any to sidestep the mismatch without changing runtime behaviour.
const SessionProvider = NextAuthSessionProvider as React.ComponentType<{ children: React.ReactNode }>;

export function Providers({ children }: { children: React.ReactNode }) {
    const clientRef = useRef<QueryClient | null>(null);
    if (!clientRef.current) {
        clientRef.current = new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: 60 * 1000,
                    retry: 1,
                },
                mutations: {
                    retry: 0,
                },
            },
        });
    }

    return (
        <SessionProvider>
            <QueryClientProvider client={clientRef.current}>
                {children}
            </QueryClientProvider>
        </SessionProvider>
    );
}
