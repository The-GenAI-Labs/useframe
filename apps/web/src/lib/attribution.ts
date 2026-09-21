"use client";

const STORAGE_KEY = "uf_attribution";

export type Attribution = {
    referralSource: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
};

/**
 * Reads ?ref / utm_* off the current URL and, on first touch only, stashes
 * them in sessionStorage. Call once on app load (root layout) — subsequent
 * calls in the same session are no-ops even if the params disappear from
 * the URL (client-side nav, etc.), so the original referrer always wins.
 */
export function captureAttribution(): void {
    if (typeof window === "undefined") return;

    try {
        if (sessionStorage.getItem(STORAGE_KEY)) return;

        const params = new URLSearchParams(window.location.search);
        const data: Attribution = {
            referralSource: params.get("ref"),
            utmSource: params.get("utm_source"),
            utmMedium: params.get("utm_medium"),
            utmCampaign: params.get("utm_campaign"),
        };

        if (Object.values(data).some(Boolean)) {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
    } catch {
        // sessionStorage can throw in private browsing / blocked storage —
        // attribution is best-effort, never worth failing the page load over.
    }
}

/** Reads back whatever captureAttribution() stashed, or null if none. */
export function getStoredAttribution(): Attribution | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as Attribution) : null;
    } catch {
        return null;
    }
}
