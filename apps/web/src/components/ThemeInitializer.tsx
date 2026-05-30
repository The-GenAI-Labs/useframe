"use client";

import { useEffect } from "react";
import { useThemeStore, applyTheme } from "@/store/themeStore";

export function ThemeInitializer() {
    const theme = useThemeStore((s) => s.theme);

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    useEffect(() => {
        if (theme !== "system") return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = () => applyTheme("system");
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, [theme]);

    return null;
}
