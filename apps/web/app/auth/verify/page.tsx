"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/authContext";

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

function MagicLinkVerifyInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { login } = useAuth();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const token = searchParams.get("token");
        if (!token) {
            router.replace("/signin?error=magic-link");
            return;
        }

        fetch(`${API_SERVICE_URL}/api/auth/magic-link/verify`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token }),
        })
            .then(async (res) => {
                const body = await res.json();
                if (!res.ok || !body.success) {
                    throw new Error(body?.message ?? "Sign-in link is invalid or expired");
                }
                login(body.data.accessToken, body.data.user);
                router.replace("/");
            })
            .catch((err) => {
                setError(err instanceof Error ? err.message : "Sign-in link is invalid or expired");
                setTimeout(() => router.replace("/signin?error=magic-link"), 1500);
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

export default function MagicLinkVerifyPage() {
    return (
        <Suspense fallback={null}>
            <MagicLinkVerifyInner />
        </Suspense>
    );
}
