"use client";

import { CrossLineBackground } from "./CrossLineBackground";
import { serif } from "@/components/home/fonts";

type Props = {
    showHero: boolean;
    modeToggle: React.ReactNode;
    headline: React.ReactNode;
    subtext: React.ReactNode;
    urlInput: string;
    onUrlChange: (value: string) => void;
    onSubmit: () => void;
    onClear?: () => void;
    isBusy: boolean;
    isDone: boolean;
    submitLabel: string;
    submitBusyLabel: string;
    placeholder: string;
    accentGradient: string;
    accentRing: string;
    children?: React.ReactNode;
};

export function AnalyzeShell({
    showHero,
    modeToggle,
    headline,
    subtext,
    urlInput,
    onUrlChange,
    onSubmit,
    onClear,
    isBusy,
    isDone,
    submitLabel,
    submitBusyLabel,
    placeholder,
    accentGradient,
    accentRing,
    children,
}: Props) {
    return (
        <div className="relative flex flex-col h-full w-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            <CrossLineBackground />

            <div className="relative px-6 md:px-10 pt-6 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-pri">Website Score</span>
                    <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: "var(--bg-bubble)", color: "var(--text-secondary)" }}
                    >
                        SEO
                    </span>
                </div>
            </div>

            {showHero ? (
                <div className="relative flex-1 flex flex-col items-center justify-center px-6 pb-16 pt-4">
                    <div className="relative w-16 h-16 mt-8">
                        <div
                            className={`absolute inset-0 -rotate-12 rounded-2xl flex items-center justify-center shadow-xl ring-1 ring-white/40 overflow-hidden z-10 ${accentGradient}`}
                        >
                            <div
                                className="absolute inset-0"
                                style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.15) 35%, transparent 60%)" }}
                            />
                            <div
                                className="absolute inset-0 opacity-[0.55] mix-blend-overlay"
                                style={{
                                    backgroundImage:
                                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0.6 0.75 0.85 0.95 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                                    backgroundSize: "60px 60px",
                                }}
                            />
                            <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className="relative drop-shadow-sm rotate-12">
                                <circle cx="10.5" cy="10.5" r="6.5" />
                                <path d="M10.5 7.2a3.3 3.3 0 0 1 3.3 3.3" strokeOpacity="0.85" />
                                <line x1="20" y1="20" x2="15.3" y2="15.3" />
                            </svg>
                        </div>

                        <div className="absolute -right-11 top-1 rotate-[26deg] w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl ring-1 ring-white/30 overflow-hidden bg-gradient-to-br from-neutral-500 via-neutral-800 to-black">
                            <div
                                className="absolute inset-0"
                                style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.15) 32%, transparent 58%)" }}
                            />
                            <div
                                className="absolute inset-0 opacity-[0.85] mix-blend-overlay"
                                style={{
                                    backgroundImage:
                                        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cfilter id='n2'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.9' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='0 0.6 0.75 0.85 0.95 1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n2)'/%3E%3C/svg%3E\")",
                                    backgroundSize: "60px 60px",
                                }}
                            />
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="relative drop-shadow-sm -rotate-[26deg]">
                                <path d="M4.5 17a8 8 0 1 1 15 0" />
                                <path d="M12 13.5l3.5-4" />
                                <circle cx="12" cy="14.5" r="1.4" fill="white" stroke="none" />
                            </svg>
                        </div>
                    </div>

                    <h1 className={`${serif.className} text-5xl md:text-6xl text-pri tracking-tight text-center leading-[1.1] mt-8`}>
                        {headline}
                    </h1>
                    <p className="text-sm text-mut text-center mt-4 max-w-md">
                        {subtext}
                    </p>

                    <div className="mt-6">{modeToggle}</div>

                    <div className="flex gap-2 w-full max-w-xl mt-8">
                        <div
                            className={`flex-1 flex items-center gap-2.5 px-5 py-3.5 rounded-full border border-base bg-surface shadow-sm focus-within:ring-2 transition-all ${accentRing}`}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-mut shrink-0">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="2" y1="12" x2="22" y2="12" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                            <input
                                type="text"
                                value={urlInput}
                                onChange={(e) => onUrlChange(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && !isBusy && onSubmit()}
                                placeholder={placeholder}
                                className="flex-1 bg-transparent text-[13.5px] text-sec placeholder:text-mut outline-none"
                                disabled={isBusy}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={onSubmit}
                            disabled={!urlInput.trim() || isBusy}
                            className={`flex items-center gap-1.5 px-6 py-3.5 rounded-full text-[13px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 shadow-sm ${accentGradient}`}
                        >
                            {isBusy ? submitBusyLabel : submitLabel}
                            {!isBusy && (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                    <polyline points="12 5 19 12 12 19" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="relative px-6 md:px-10 pt-2 pb-4 shrink-0">
                    <div className="flex items-center justify-between gap-3 max-w-2xl">
                        {modeToggle}
                        <div
                            className={`flex-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-base bg-surface shadow-sm focus-within:ring-2 transition-all ${accentRing}`}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-mut shrink-0">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="2" y1="12" x2="22" y2="12" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                            </svg>
                            <input
                                type="text"
                                value={urlInput}
                                onChange={(e) => onUrlChange(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && !isBusy && onSubmit()}
                                placeholder={placeholder}
                                className="flex-1 bg-transparent text-[13.5px] text-sec placeholder:text-mut outline-none"
                                disabled={isBusy}
                            />
                            {isDone && onClear && (
                                <button
                                    type="button"
                                    onClick={onClear}
                                    className="text-mut hover:text-sec transition-colors cursor-pointer shrink-0"
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
                            onClick={onSubmit}
                            disabled={!urlInput.trim() || isBusy}
                            className={`px-5 py-3 rounded-2xl text-[13px] font-semibold disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 shadow-sm text-white ${accentGradient}`}
                        >
                            {isBusy ? submitBusyLabel : submitLabel}
                        </button>
                    </div>
                </div>
            )}

            <div className="relative flex-1 flex flex-col">{children}</div>
        </div>
    );
}
