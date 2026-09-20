"use client";

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

export async function checkUserExists(email: string): Promise<boolean> {
    // Cosmetic only — used purely to pick "Welcome back" vs "Create your
    // account" copy in AuthForm. Never gates which backend call is made.
    try {
        const res = await fetch(
            `${API_SERVICE_URL}/api/auth/check-email?email=${encodeURIComponent(email)}`
        );
        if (!res.ok) return false;
        const body = await res.json();
        return !!body?.data?.exists;
    } catch {
        return false;
    }
}

export function signInWithGoogle() {
    window.location.href = `${API_SERVICE_URL}/api/auth/google`;
}

export function signInWithGitHub() {
    window.location.href = `${API_SERVICE_URL}/api/auth/github`;
}

export async function signInWithEmail(email: string) {
    try {
        const res = await fetch(`${API_SERVICE_URL}/api/auth/magic-link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        const body = await res.json();
        if (!res.ok || !body.success) {
            return { success: false, error: body?.message ?? "Something went wrong" };
        }
        return { success: true };
    } catch {
        return { success: false, error: "Something went wrong" };
    }
}
