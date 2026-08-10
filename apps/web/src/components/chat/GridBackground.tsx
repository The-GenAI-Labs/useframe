"use client";

import { memo } from "react";
import { useThemeStore } from "@/store/themeStore";

export default memo(function GridBackground() {
    const theme = useThemeStore((s) => s.theme);
    const isDark = theme === "dark" || (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

    return (
        <div className="absolute inset-0 rounded-4xl bg-gray-800 overflow-hidden pointer-events-none">
            <img
                src={isDark ? "/chat/darkuseframecloud.png" : "/chat/useframe cloudchat1.png"}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
            />
            {!isDark && (
                <>
                    <div className="absolute inset-0 bg-white/30" />
                    <div className="absolute top-0 left-0 right-0 h-32 bg-linear-to-b from-white/50 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 h-40 bg-linear-to-t from-white/60 to-transparent" />
                    <div className="absolute top-0 left-0 bottom-0 w-24 bg-linear-to-r from-white/40 to-transparent" />
                    <div className="absolute top-0 right-0 bottom-0 w-24 bg-linear-to-l from-white/40 to-transparent" />
                    <div className="absolute inset-0 rounded-4xl" style={{ boxShadow: "inset 0 0 80px rgba(0,0,0,0.08)" }} />
                </>
            )}
        </div>
    );
});
