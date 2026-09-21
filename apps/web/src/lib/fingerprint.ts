"use client";

import FingerprintJS from "@fingerprintjs/fingerprintjs";

let cached: Promise<string> | null = null;

// Open-source FingerprintJS is client-side only and can be spoofed by a
// determined attacker (clearing storage, a fresh browser profile) — it
// stops the CASUAL free-tier farming case (same browser, cycling emails),
// not a sophisticated one. That's the honest tradeoff; if evasion of this
// becomes a real problem, Fingerprint Pro (paid, server-side) is a drop-in
// upgrade later, not something to build now.
//
// Memoized for the lifetime of the page load — the visitorId is stable
// per-browser anyway, and there's no reason to re-run the collector for
// every signup-related call on the same page.
export async function getDeviceFingerprint(): Promise<string | undefined> {
    if (typeof window === "undefined") return undefined;

    try {
        if (!cached) {
            cached = FingerprintJS.load().then((fp) => fp.get().then((result) => result.visitorId));
        }
        return await cached;
    } catch {
        // Best-effort signal — never block signup over this failing.
        cached = null;
        return undefined;
    }
}
