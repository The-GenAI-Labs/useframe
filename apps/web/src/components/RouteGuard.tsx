"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";

const PUBLIC_ROUTES = ["/"];

export function RouteGuard({ children }: { children: React.ReactNode }) {
    const { status } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    const isPublic = PUBLIC_ROUTES.includes(pathname);

    useEffect(() => {
        if (status === "unauthenticated" && !isPublic) {
            router.replace(`/signin?callbackUrl=${encodeURIComponent(pathname)}`);
        }
    }, [status, isPublic, pathname, router]);

    if (status === "loading") {
        return null;
    }

    if (status === "unauthenticated" && !isPublic) {
        return null;
    }

    return <>{children}</>;
}
