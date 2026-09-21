"use client";

import { getStoredAttribution } from "@/lib/attribution";
import { getDeviceFingerprint } from "@/lib/fingerprint";

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000";

// OAuth bounces the browser away to Google/GitHub and back — there's no
// in-page moment to check a consent box once that redirect starts, so the
// checkbox on the signin page stashes its state here first. /auth/callback
// reads it back and sends it with exchange-ticket. This is a UX gate only:
// the server independently requires acceptedTerms on exchange-ticket, so a
// tampered/missing flag fails closed, not open.
const OAUTH_CONSENT_KEY = "uf_oauth_consent";

export function setOAuthConsent(accepted: boolean) {
    try {
        sessionStorage.setItem(OAUTH_CONSENT_KEY, accepted ? "1" : "0");
    } catch {
        // best-effort — see getStoredAttribution for why this can throw
    }
}

export function consumeOAuthConsent(): boolean {
    try {
        const value = sessionStorage.getItem(OAUTH_CONSENT_KEY) === "1";
        sessionStorage.removeItem(OAUTH_CONSENT_KEY);
        return value;
    } catch {
        return false;
    }
}

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

export async function signInWithEmail(email: string, turnstileToken: string) {
    try {
        const res = await fetch(`${API_SERVICE_URL}/api/auth/magic-link`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email,
                turnstileToken,
                acceptedTerms: true,
                attribution: getStoredAttribution() ?? undefined,
                deviceFingerprint: await getDeviceFingerprint(),
            }),
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
