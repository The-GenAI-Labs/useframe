"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

function OAuthCallbackInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { login } = useAuth();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const ticket = searchParams.get("ticket");
        if (!ticket) {
            router.replace("/signin?error=oauth");
            return;
        }

        fetch(`${API_SERVICE_URL}/api/auth/exchange-ticket`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ticket }),
        })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok || !body.success) {
                    throw new Error(body?.message ?? "Sign-in failed");
                }
                login(body.data.accessToken, body.data.user);
                router.replace("/");
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : "Sign-in failed");
                setTimeout(() => router.replace("/signin?error=oauth"), 1500);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="flex h-screen w-full items-center justify-center">
            <p className="text-sm text-mut">
                {error ? error : "Signing you in…"}
            </p>
        </div>
    );
}

export default function OAuthCallbackPage() {
    return (
        <Suspense fallback={null}>
            <OAuthCallbackInner />
        </Suspense>
    );
}
