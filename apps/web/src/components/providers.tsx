"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/authContext";
import { useRef } from "react";

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
        <AuthProvider>
            <QueryClientProvider client={clientRef.current}>
                {children}
            </QueryClientProvider>
        </AuthProvider>
    );
}
