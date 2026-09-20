"use client";

import { motion } from "framer-motion";

export type ScoreMode = "score" | "seo";

type Props = {
    mode: ScoreMode;
    onChange: (mode: ScoreMode) => void;
};

const OPTIONS: { id: ScoreMode; label: string }[] = [
    { id: "score", label: "Website Score" },
    { id: "seo", label: "SEO" },
];

const ICONS: Record<ScoreMode, React.ReactNode> = {
    score: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
    ),
    seo: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
    ),
};

export function ModeToggle({ mode, onChange }: Props) {
    return (
        <div className="relative inline-flex items-center gap-1 p-1 rounded-full border border-base bg-tertiary w-fit">
            {OPTIONS.map((opt) => {
                const isActive = mode === opt.id;
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChange(opt.id)}
                        className="relative z-10 flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] font-semibold cursor-pointer"
                    >
                        {isActive && (
                            <motion.div
                                layoutId="mode-toggle-pill"
                                className="absolute inset-0 rounded-full shadow-sm"
                                style={{ backgroundColor: "#3b82f6" }}
                                transition={{ type: "spring", stiffness: 350, damping: 28, duration: 0.5 }}
                            />
                        )}
                        <motion.span
                            className="relative inline-flex"
                            animate={isActive ? { scale: [1, 1.4, 0.9, 1.1, 1] } : { scale: 1 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            style={{ color: isActive ? "#fff" : undefined }}
                        >
                            {ICONS[opt.id]}
                        </motion.span>
                        <motion.span
                            className="relative"
                            animate={{ color: isActive ? "#ffffff" : "var(--text-muted)" }}
                            transition={{ duration: 0.5, ease: "easeInOut" }}
                        >
                            {opt.label}
                        </motion.span>
                    </button>
                );
            })}
        </div>
    );
}
