"use client";

import { memo, useState } from "react";

export const ContextBanner = memo(function ContextBanner() {
    const [dismissed, setDismissed] = useState(false);
    if (dismissed) return null;

    return (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-indigo-600">
            <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-indigo-400 flex items-center justify-center shrink-0">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="white">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                    </svg>
                </div>
                <span className="font-medium">Add context from your workspace</span>
            </div>
            <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-indigo-400 hover:text-indigo-600 transition-colors cursor-pointer ml-2 shrink-0"
                aria-label="Dismiss context banner"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>
    );
});
