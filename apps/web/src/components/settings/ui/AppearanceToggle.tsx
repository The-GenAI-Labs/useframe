"use client";

import { memo, useState, useCallback } from "react";

type Mode = "system" | "light" | "dark";

export const AppearanceToggle = memo(function AppearanceToggle() {
    const [mode, setMode] = useState<Mode>("light");
    const set = useCallback((m: Mode) => () => setMode(m), []);

    return (
        <div className="flex items-center gap-1 p-1 rounded-lg bg-black/4 border border-black/[0.07]">
            <button
                type="button"
                onClick={set("system")}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${mode === "system" ? "bg-white shadow-sm text-black/70" : "text-black/30 hover:text-black/55"}`}
                aria-label="System"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
            </button>
            <button
                type="button"
                onClick={set("light")}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${mode === "light" ? "bg-white shadow-sm text-black/70" : "text-black/30 hover:text-black/55"}`}
                aria-label="Light"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
            </button>
            <button
                type="button"
                onClick={set("dark")}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${mode === "dark" ? "bg-white shadow-sm text-black/70" : "text-black/30 hover:text-black/55"}`}
                aria-label="Dark"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
            </button>
        </div>
    );
});
