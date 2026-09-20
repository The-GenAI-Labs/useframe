"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { seoApi, type GetSeoAuditResponse } from "@/lib/api/services/seo.service";
import { RingScore, gradeLabel } from "@/components/shared/RingScore";
import { AnalyzeShell } from "@/components/web-score/AnalyzeShell";

type ViewState =
    | { status: "idle" }
    | { status: "polling"; auditId: string; url: string; phase: "PENDING" | "CRAWLING" | "AUDITING" }
    | { status: "done"; url: string; result: GetSeoAuditResponse }
    | { status: "failed"; url: string; reason: string };

const PHASE_TEXT: Record<string, string> = {
    PENDING: "Queuing audit…",
    CRAWLING: "Discovering pages and crawling the site…",
    AUDITING: "Running Lighthouse and analyzing results…",
};

function LighthouseCard({ label, score }: { label: string; score: number | null }) {
    const value = score ?? 0;
    const { grade, color, bg } = gradeLabel(value);
    return (
        <div className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-base bg-surface hover:border-em hover:shadow-sm transition-all">
            <div className="relative">
                <RingScore score={value} size={64} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[15px] font-bold text-pri leading-none">
                        {score ?? "—"}
                    </span>
                </div>
            </div>
            <p className="text-[11.5px] font-medium text-sec text-center">{label}</p>
            {score != null && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${bg} ${color}`}>
                    Grade {grade}
                </span>
            )}
        </div>
    );
}

const PRIORITY_STYLES: Record<string, { color: string; bg: string; label: string }> = {
    high: { color: "text-red-600", bg: "bg-red-50", label: "High" },
    medium: { color: "text-amber-600", bg: "bg-amber-50", label: "Medium" },
    low: { color: "text-blue-600", bg: "bg-blue-50", label: "Low" },
};

export default function SeoAuditView({
    initialUrl = "",
    modeToggle,
}: {
    initialUrl?: string;
    modeToggle?: React.ReactNode;
}) {
    const [urlInput, setUrlInput] = useState(initialUrl);
    const [state, setState] = useState<ViewState>({ status: "idle" });
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const handleAudit = useCallback(() => {
        const raw = urlInput.trim();
        if (!raw) return;
        const url = raw.startsWith("http") ? raw : `https://${raw}`;

        // Tier is hardcoded to "free" — paid-tier UI is deferred until billing exists.
        seoApi
            .create(url, "free")
            .then(({ seoAuditId }) => {
                setState({ status: "polling", auditId: seoAuditId, url, phase: "PENDING" });

                pollRef.current = setInterval(() => {
                    seoApi
                        .get(seoAuditId)
                        .then((result) => {
                            if (result.status === "DONE") {
                                if (pollRef.current) clearInterval(pollRef.current);
                                setState({ status: "done", url, result });
                            } else if (result.status === "FAILED") {
                                if (pollRef.current) clearInterval(pollRef.current);
                                setState({ status: "failed", url, reason: result.failureReason ?? "Something went wrong." });
                            } else {
                                setState((s) =>
                                    s.status === "polling"
                                        ? { ...s, phase: result.status as "PENDING" | "CRAWLING" | "AUDITING" }
                                        : s
                                );
                            }
                        })
                        .catch(() => {
                            if (pollRef.current) clearInterval(pollRef.current);
                            setState({ status: "failed", url, reason: "Lost connection while checking status." });
                        });
                }, 2000);
            })
            .catch((err) => {
                setState({
                    status: "failed",
                    url,
                    reason: err instanceof Error ? err.message : "Failed to start the audit.",
                });
            });
    }, [urlInput]);

    const handleReset = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        setState({ status: "idle" });
        setUrlInput("");
    }, []);

    const isBusy = state.status === "polling";
    const overallScore = state.status === "done" ? state.result.computedScore ?? state.result.seoScore ?? 0 : 0;
    const { grade, color: gradeColor, bg: gradeBg } = gradeLabel(overallScore);

    return (
        <AnalyzeShell
            showHero={state.status === "idle"}
            modeToggle={modeToggle}
            headline={
                <>
                    Turn Your Website Into
                    <br />
                    <span className="text-emerald-500">Higher Ranking</span>
                </>
            }
            subtext={
                <>
                    Get a detailed SEO analysis with actionable insights
                    <br />
                    to improve your website&apos;s performance.
                </>
            }
            urlInput={urlInput}
            onUrlChange={setUrlInput}
            onSubmit={handleAudit}
            onClear={handleReset}
            isBusy={isBusy}
            isDone={state.status === "done" || state.status === "failed"}
            submitLabel="Analyze"
            submitBusyLabel="Auditing…"
            placeholder="yourwebsite.com or paste full URL"
            accentGradient="bg-linear-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
            accentRing="focus-within:border-emerald-300 focus-within:ring-emerald-100"
        >
            {state.status === "polling" && (
                <div className="flex flex-col items-center justify-center flex-1 gap-6 px-6 py-12">
                    <div className="relative w-20 h-20">
                        <div className="absolute inset-0 rounded-full border-4 border-base" />
                        <div className="absolute inset-0 rounded-full border-4 border-t-emerald-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-emerald-500">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                        </div>
                    </div>
                    <div className="flex flex-col items-center gap-1.5">
                        <p className="text-sm font-semibold text-sec">{PHASE_TEXT[state.phase]}</p>
                        <p className="text-xs text-mut">{state.url}</p>
                    </div>
                </div>
            )}

            {state.status === "failed" && (
                <div className="flex-1 flex items-center justify-center px-6 pb-10">
                    <div className="flex flex-col items-center gap-4 text-center max-w-sm">
                        <div className="w-16 h-16 rounded-3xl bg-red-50 border border-red-200 flex items-center justify-center dark:bg-red-950/30 dark:border-red-900">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-red-500">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-pri">Couldn&apos;t audit that page</p>
                            <p className="text-xs text-mut mt-1 leading-relaxed">{state.reason}</p>
                        </div>
                        <button
                            type="button"
                            onClick={handleReset}
                            className="px-4 py-2 rounded-xl border border-base text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            )}

            {state.status === "done" && (
                <div className="px-6 md:px-10 pb-10 flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row gap-5 items-start md:items-center p-6 rounded-3xl border border-base bg-surface shadow-sm max-w-2xl">
                        <div className="relative shrink-0">
                            <RingScore score={overallScore} size={96} />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[22px] font-bold text-pri leading-none">{overallScore}</span>
                                <span className="text-[10px] text-mut font-medium">/100</span>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className={`text-2xl font-bold ${gradeColor}`}>Grade {grade}</span>
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-xl ${gradeBg} ${gradeColor}`}>
                                    {overallScore >= 80 ? "Well optimized" : overallScore >= 60 ? "Needs improvement" : "Critical issues"}
                                </span>
                            </div>
                            <p className="text-sm text-sec leading-relaxed truncate">{state.url}</p>
                            <p className="text-xs text-mut">
                                {state.result.pagesCrawled ?? 0} page{state.result.pagesCrawled === 1 ? "" : "s"} crawled
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
                        <LighthouseCard label="Performance" score={state.result.performanceScore} />
                        <LighthouseCard label="Accessibility" score={state.result.accessibilityScore} />
                        <LighthouseCard label="SEO" score={state.result.seoScore} />
                        <LighthouseCard label="Best Practices" score={state.result.bestPracticesScore} />
                    </div>

                    {state.result.llmSummary && (
                        <div className="flex flex-col gap-4 max-w-2xl">
                            <div className="flex items-start gap-2 p-4 rounded-2xl bg-tertiary border border-base">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-emerald-500 shrink-0 mt-0.5">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <p className="text-[12.5px] text-sec leading-relaxed">{state.result.llmSummary.explanation}</p>
                            </div>

                            {state.result.llmSummary.fixes.length > 0 && (
                                <div className="flex flex-col gap-2">
                                    <p className="text-[13px] font-semibold text-sec px-1">Prioritized fixes</p>
                                    {state.result.llmSummary.fixes.map((fix, i) => {
                                        const style = PRIORITY_STYLES[fix.priority] ?? PRIORITY_STYLES.low;
                                        return (
                                            <div key={i} className="flex items-start gap-3 p-3.5 rounded-2xl border border-base bg-surface">
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg shrink-0 mt-0.5 ${style.bg} ${style.color}`}>
                                                    {style.label}
                                                </span>
                                                <div className="flex flex-col gap-0.5">
                                                    <p className="text-[12.5px] font-semibold text-pri">{fix.title}</p>
                                                    <p className="text-[11.5px] text-mut leading-relaxed">{fix.detail}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 max-w-2xl">
                        <button
                            type="button"
                            onClick={handleReset}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-base text-[12.5px] font-medium text-sec hover:text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer"
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <polyline points="1 4 1 10 7 10" />
                                <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
                            </svg>
                            Audit another URL
                        </button>
                    </div>
                </div>
            )}
        </AnalyzeShell>
    );
}
