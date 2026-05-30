"use client";

import { memo, useCallback } from "react";
import { useThemeStore, type Theme } from "@/store/themeStore";

export const AppearanceToggle = memo(function AppearanceToggle() {
    const { theme, setTheme } = useThemeStore();
    const set = useCallback((m: Theme) => () => setTheme(m), [setTheme]);

    return (
        <div className="flex items-center gap-1 p-1 rounded-lg bg-tertiary border border-base">
            <button
                type="button"
                onClick={set("system")}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${theme === "system" ? "bg-surface shadow-sm text-pri" : "text-mut hover:text-sec"}`}
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
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${theme === "light" ? "bg-surface shadow-sm text-pri" : "text-mut hover:text-sec"}`}
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
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${theme === "dark" ? "bg-surface shadow-sm text-pri" : "text-mut hover:text-sec"}`}
                aria-label="Dark"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
            </button>
        </div>
    );
});
