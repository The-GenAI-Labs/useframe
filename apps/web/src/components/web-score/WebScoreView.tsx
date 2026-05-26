"use client";

import { useState, useCallback } from "react";

interface ScoreCategory {
    key: string;
    label: string;
    description: string;
    score: number;
    max: number;
    insight: string;
    icon: React.ReactNode;
}

interface ScanState {
    status: "idle" | "scanning" | "done";
    url: string;
    overall: number;
    categories: ScoreCategory[];
    scannedAt: Date | null;
}

function RingScore({ score, size = 96 }: { score: number; size?: number }) {
    const radius = (size - 12) / 2;
    const circumference = 2 * Math.PI * radius;
    const filled = (score / 100) * circumference;
    const color =
        score >= 80 ? "#3b82f6" : score >= 55 ? "#f59e0b" : "#ef4444";

    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                className="text-black/6"
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth="6"
                strokeDasharray={`${filled} ${circumference}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 1s cubic-bezier(.4,0,.2,1)" }}
            />
        </svg>
    );
}

function ScoreBar({ value, max }: { value: number; max: number }) {
    const pct = Math.round((value / max) * 100);
    const color =
        pct >= 80 ? "bg-blue-500" : pct >= 55 ? "bg-amber-400" : "bg-red-400";
    return (
        <div className="h-1.5 w-full rounded-full bg-black/6 overflow-hidden">
            <div
                className={`h-full rounded-full ${color} transition-all duration-700`}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

function gradeLabel(score: number) {
    if (score >= 90) return { grade: "A", color: "text-blue-600", bg: "bg-blue-50" };
    if (score >= 75) return { grade: "B", color: "text-blue-500", bg: "bg-blue-50" };
    if (score >= 60) return { grade: "C", color: "text-amber-600", bg: "bg-amber-50" };
    if (score >= 45) return { grade: "D", color: "text-orange-600", bg: "bg-orange-50" };
    return { grade: "F", color: "text-red-600", bg: "bg-red-50" };
}

// deterministic mock score from URL string — same URL = same result
function scoreFromUrl(url: string): ScanState["categories"] {
    const seed = url.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const rnd = (min: number, max: number, offset: number) => {
        const v = ((seed * (offset + 1) * 2654435761) >>> 0) % (max - min + 1);
        return min + v;
    };

    return [
        {
            key: "visual",
            label: "Visual Hierarchy",
            description: "Contrast ratios, type scale, whitespace, focal points",
            score: rnd(55, 98, 1),
            max: 100,
            insight: "Strong typographic scale detected. Ensure H1 contrast ≥ 4.5:1 on all backgrounds.",
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                </svg>
            ),
        },
        {
            key: "layout",
            label: "Layout & Grid",
            description: "Alignment, spacing consistency, grid adherence",
            score: rnd(50, 95, 2),
            max: 100,
            insight: "Consistent 8pt grid detected. Check right-column alignment on mobile breakpoint.",
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
            ),
        },
        {
            key: "typography",
            label: "Typography",
            description: "Line height, font pairing, readability, text density",
            score: rnd(48, 96, 3),
            max: 100,
            insight: "Line height is optimal (1.5–1.7). Consider reducing font families to ≤ 2 for cohesion.",
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <polyline points="4 7 4 4 20 4 20 7" />
                    <line x1="9" y1="20" x2="15" y2="20" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                </svg>
            ),
        },
        {
            key: "color",
            label: "Color System",
            description: "Palette harmony, accessible contrast, brand consistency",
            score: rnd(52, 97, 4),
            max: 100,
            insight: "Primary palette is harmonious. Secondary accent overused — reserve for CTAs only.",
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 2a10 10 0 0 1 0 20" />
                    <path d="M2 12h20" />
                </svg>
            ),
        },
        {
            key: "ux",
            label: "UX Patterns",
            description: "CTA placement, navigation clarity, interaction feedback",
            score: rnd(45, 94, 5),
            max: 100,
            insight: "Primary CTA position is above the fold. Add loading states to async interactions.",
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
            ),
        },
        {
            key: "responsive",
            label: "Responsiveness",
            description: "Mobile breakpoints, touch targets, viewport adaptation",
            score: rnd(50, 96, 6),
            max: 100,
            insight: "Desktop breakpoints look solid. Touch targets on mobile nav should be ≥ 44px.",
            icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <rect x="5" y="2" width="14" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
            ),
        },
    ];
}

const SCAN_STEPS = [
    "Fetching page structure…",
    "Analyzing visual hierarchy…",
    "Checking layout grid…",
    "Evaluating typography…",
    "Auditing color system…",
    "Testing UX patterns…",
    "Running responsiveness check…",
    "Compiling score…",
];

export default function WebScoreView() {
    const [urlInput, setUrlInput] = useState("");
    const [state, setState] = useState<ScanState>({
        status: "idle",
        url: "",
        overall: 0,
        categories: [],
        scannedAt: null,
    });
    const [scanStep, setScanStep] = useState(0);

    const handleScan = useCallback(() => {
        const raw = urlInput.trim();
        if (!raw) return;
        const url = raw.startsWith("http") ? raw : `https://${raw}`;

        setState({ status: "scanning", url, overall: 0, categories: [], scannedAt: null });
        setScanStep(0);

        let step = 0;
        const stepInterval = setInterval(() => {
            step++;
            setScanStep(step);
            if (step >= SCAN_STEPS.length - 1) clearInterval(stepInterval);
        }, 420);

        setTimeout(() => {
            clearInterval(stepInterval);
            const cats = scoreFromUrl(url);
            const overall = Math.round(cats.reduce((s, c) => s + (c.score / c.max) * 100, 0) / cats.length);
            setState({ status: "done", url, overall, categories: cats, scannedAt: new Date() });
        }, SCAN_STEPS.length * 420 + 200);
    }, [urlInput]);

    const handleReset = useCallback(() => {
        setState({ status: "idle", url: "", overall: 0, categories: [], scannedAt: null });
        setUrlInput("");
        setScanStep(0);
    }, []);

    const { grade, color: gradeColor, bg: gradeBg } = gradeLabel(state.overall);

    return (
        <div className="flex flex-col h-full w-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            <div className="px-6 md:px-10 pt-8 pb-4 shrink-0">
                <div className="flex flex-col gap-1 mb-6">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-linear-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <h1 className="text-2xl font-bold text-black/85 tracking-tight">Web Score</h1>
                    </div>
                    <p className="text-sm text-black/40 ml-0.5">
                        Science-based design audit — get a score across 6 UX dimensions.
                    </p>
                </div>

                {/* URL input */}
                <div className="flex gap-2 max-w-2xl">
                    <div className="flex-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-black/10 bg-white shadow-sm focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-black/25 shrink-0">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        <input
                            type="text"
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && state.status !== "scanning" && handleScan()}
                            placeholder="yoursite.com or paste full URL"
                            className="flex-1 bg-transparent text-[13.5px] text-black/70 placeholder:text-black/25 outline-none"
                            disabled={state.status === "scanning"}
                        />
                        {state.status === "done" && (
                            <button
                                type="button"
                                onClick={handleReset}
                                className="text-black/25 hover:text-black/50 transition-colors cursor-pointer shrink-0"
                                aria-label="Clear"
                            >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleScan}
                        disabled={!urlInput.trim() || state.status === "scanning"}
                        className="px-5 py-3 rounded-2xl bg-black text-white text-[13px] font-semibold hover:bg-black/80 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 shadow-sm"
                    >
                        {state.status === "scanning" ? "Scanning…" : "Analyze"}
                    </button>
                </div>
            </div>

            {/* Scanning animation */}
            {state.status === "scanning" && (
                <div className="flex flex-col items-center justify-center flex-1 gap-6 px-6 py-12">
                    <div className="relative w-20 h-20">
                        <div className="absolute inset-0 rounded-full border-4 border-black/6" />
                        <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-blue-500">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                        <p className="text-sm font-semibold text-black/70">{SCAN_STEPS[Math.min(scanStep, SCAN_STEPS.length - 1)]}</p>
                        <p className="text-xs text-black/30">{state.url}</p>
                    </div>
                    <div className="flex gap-1">
                        {SCAN_STEPS.map((_, i) => (
                            <div
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i <= scanStep ? "bg-blue-500" : "bg-black/10"}`}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Results */}
            {state.status === "done" && (
                <div className="px-6 md:px-10 pb-10 flex flex-col gap-6">
                    {/* Overall score hero */}
                    <div className="flex flex-col md:flex-row gap-5 items-start md:items-center p-6 rounded-3xl border border-black/[0.07] bg-white shadow-sm max-w-2xl">
                        <div className="relative shrink-0">
                            <RingScore score={state.overall} size={96} />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[22px] font-bold text-black/85 leading-none">{state.overall}</span>
                                <span className="text-[10px] text-black/30 font-medium">/100</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className={`text-2xl font-bold ${gradeColor}`}>Grade {grade}</span>
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-xl ${gradeBg} ${gradeColor}`}>
                                    {state.overall >= 80 ? "Production ready" : state.overall >= 60 ? "Needs improvement" : "Critical issues"}
                                </span>
                            </div>
                            <p className="text-sm text-black/50 leading-relaxed truncate">{state.url}</p>
                            <p className="text-xs text-black/30">
                                Scanned at {state.scannedAt?.toLocaleTimeString()} · 6 dimensions analyzed
                            </p>
                        </div>
                    </div>

                    {/* Categories grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
                        {state.categories.map((cat) => {
                            const pct = Math.round((cat.score / cat.max) * 100);
                            const { grade: g, color: gc, bg: gb } = gradeLabel(pct);
                            return (
                                <div
                                    key={cat.key}
                                    className="flex flex-col gap-3 p-4 rounded-2xl border border-black/[0.07] bg-white hover:border-black/12 hover:shadow-sm transition-all"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <div className="w-8 h-8 rounded-xl bg-black/4 flex items-center justify-center text-black/40 shrink-0">
                                                {cat.icon}
                                            </div>
                                            <div>
                                                <p className="text-[13px] font-semibold text-black/75 leading-tight">{cat.label}</p>
                                                <p className="text-[11px] text-black/35 leading-tight mt-0.5">{cat.description}</p>
                                            </div>
                                        </div>
                                        <div className={`flex items-center justify-center w-8 h-8 rounded-xl text-sm font-bold shrink-0 ${gb} ${gc}`}>
                                            {g}
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-black/30">Score</span>
                                            <span className="text-[12px] font-semibold text-black/60">{pct}/100</span>
                                        </div>
                                        <ScoreBar value={cat.score} max={cat.max} />
                                    </div>

                                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-black/[0.025] border border-black/[0.04]">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-400 shrink-0 mt-0.5">
                                            <circle cx="12" cy="12" r="10" />
                                            <line x1="12" y1="8" x2="12" y2="12" />
                                            <line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                        <p className="text-[11.5px] text-black/45 leading-relaxed">{cat.insight}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Action row */}
                    <div className="flex flex-wrap gap-2 max-w-2xl">
                        <button
                            type="button"
                            onClick={handleReset}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 text-[12.5px] font-medium text-black/50 hover:text-black/70 hover:border-black/20 hover:bg-black/3 transition-all cursor-pointer"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <polyline points="1 4 1 10 7 10" />
                                <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
                            </svg>
                            Scan another URL
                        </button>
                        <button
                            type="button"
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 text-[12.5px] font-medium text-black/50 hover:text-black/70 hover:border-black/20 hover:bg-black/3 transition-all cursor-pointer"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Export report
                        </button>
                    </div>
                </div>
            )}

            {/* Idle state hint */}
            {state.status === "idle" && (
                <div className="flex-1 flex items-center justify-center px-6 pb-10">
                    <div className="flex flex-col items-center gap-4 text-center max-w-xs">
                        <div className="w-16 h-16 rounded-3xl bg-black/3 border border-black/[0.06] flex items-center justify-center">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-black/20">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-black/40">Paste any URL above</p>
                            <p className="text-xs text-black/25 mt-1 leading-relaxed">
                                We'll analyze visual hierarchy, layout, typography, color system, UX patterns, and responsiveness.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 justify-center">
                            {["Visual Hierarchy", "Typography", "Color System", "UX Patterns", "Layout", "Responsiveness"].map((t) => (
                                <span key={t} className="px-2.5 py-1 rounded-lg bg-black/4 text-[11px] text-black/35 font-medium">
                                    {t}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
