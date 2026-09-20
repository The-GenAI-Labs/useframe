"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { scoreApi, type ScoreReport, type ScoreCriterionResult } from "@/lib/api/services/score.service";
import { RingScore, gradeLabel } from "@/components/shared/RingScore";
import { ModeToggle, type ScoreMode } from "@/components/web-score/ModeToggle";
import { AnalyzeShell } from "@/components/web-score/AnalyzeShell";
import SeoAuditView from "@/components/web-score/SeoAuditView";

type CriterionKey = keyof Omit<ScoreReport, "overallScore">;

const CRITERIA_META: Record<CriterionKey, { label: string; description: string; icon: React.ReactNode }> = {
    visualHierarchy: {
        label: "Visual Hierarchy",
        description: "Primary CTA dominance, heading hierarchy, reading flow, whitespace",
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
            </svg>
        ),
    },
    typographyReadability: {
        label: "Typography & Readability",
        description: "Font size, line length, line height, font-family count",
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
        ),
    },
    colorContrastA11y: {
        label: "Color, Contrast & A11y",
        description: "WCAG contrast ratios, palette size, niche-appropriate color",
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a10 10 0 0 1 0 20" />
                <path d="M2 12h20" />
            </svg>
        ),
    },
    copyPersuasion: {
        label: "Copy & Persuasion",
        description: "Value proposition clarity, CTA text, social proof, objection handling",
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
        ),
    },
    seoTechnical: {
        label: "SEO & Technical",
        description: "Title/meta tags, heading structure, Open Graph tags",
        icon: (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <rect x="5" y="2" width="14" height="20" rx="2" />
                <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
        ),
    },
};

const CRITERION_KEYS: CriterionKey[] = [
    "visualHierarchy",
    "typographyReadability",
    "colorContrastA11y",
    "copyPersuasion",
    "seoTechnical",
];

type ViewState =
    | { status: "idle" }
    | { status: "polling"; scoreId: string; url: string; phase: "PENDING" | "SCANNING" | "ANALYZING" }
    | { status: "done"; url: string; report: ScoreReport; screenshotBase64: string | null }
    | { status: "failed"; url: string; reason: string };

const PHASE_TEXT: Record<string, string> = {
    PENDING: "Queuing scan…",
    SCANNING: "Rendering the page and capturing a screenshot…",
    ANALYZING: "Analyzing with AI across 5 criteria…",
};

function ScoreBar({ value }: { value: number }) {
    const pct = Math.max(0, Math.min(100, Math.round(value)));
    const color =
        pct >= 80 ? "bg-blue-500" : pct >= 55 ? "bg-amber-400" : "bg-red-400";
    return (
        <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
            <div
                className={`h-full rounded-full ${color} transition-all duration-700`}
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

function CriterionCard({ criterionKey, result }: { criterionKey: CriterionKey; result: ScoreCriterionResult }) {
    const [expanded, setExpanded] = useState(false);
    const meta = CRITERIA_META[criterionKey];
    const { grade, color, bg } = gradeLabel(result.score);

    return (
        <div className="flex flex-col gap-3 p-4 rounded-2xl border border-base bg-surface hover:border-em hover:shadow-sm transition-all">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-tertiary flex items-center justify-center text-mut shrink-0">
                        {meta.icon}
                    </div>
                    <div>
                        <p className="text-[13px] font-semibold text-sec leading-tight">{meta.label}</p>
                        <p className="text-[11px] text-mut leading-tight mt-0.5">{meta.description}</p>
                    </div>
                </div>
                <div className={`flex items-center justify-center w-8 h-8 rounded-xl text-sm font-bold shrink-0 ${bg} ${color}`}>
                    {grade}
                </div>
            </div>

            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-mut">Score</span>
                    <span className="text-[12px] font-semibold text-sec">{result.score}/100</span>
                </div>
                <ScoreBar value={result.score} />
            </div>

            <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-tertiary border border-base">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-blue-400 shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div className="flex flex-col gap-1">
                    <p className="text-[11.5px] text-sec leading-relaxed">{result.explanation}</p>
                    <p className="text-[10.5px] text-mut italic">{result.citation}</p>
                </div>
            </div>

            {result.issues.length > 0 && (
                <div>
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="text-[11px] font-medium text-mut hover:text-sec transition-colors cursor-pointer"
                    >
                        {expanded ? "Hide" : "Show"} {result.issues.length} issue{result.issues.length > 1 ? "s" : ""}
                    </button>
                    {expanded && (
                        <ul className="mt-1.5 flex flex-col gap-1">
                            {result.issues.map((issue, i) => (
                                <li key={i} className="text-[11px] text-mut leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0">
                                    {issue}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

export default function WebScoreView({ initialUrl = "" }: { initialUrl?: string }) {
    const [mode, setMode] = useState<ScoreMode>("score");
    const [urlInput, setUrlInput] = useState(initialUrl);
    const [state, setState] = useState<ViewState>({ status: "idle" });
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const handleScan = useCallback(() => {
        const raw = urlInput.trim();
        if (!raw) return;
        const url = raw.startsWith("http") ? raw : `https://${raw}`;

        scoreApi
            .create(url)
            .then(({ scoreId }) => {
                setState({ status: "polling", scoreId, url, phase: "PENDING" });

                pollRef.current = setInterval(() => {
                    scoreApi
                        .get(scoreId)
                        .then((result) => {
                            if (result.status === "DONE" && result.report) {
                                if (pollRef.current) clearInterval(pollRef.current);
                                scoreApi
                                    .getScreenshot(scoreId)
                                    .then(({ screenshotBase64 }) => {
                                        setState({ status: "done", url, report: result.report!, screenshotBase64 });
                                    })
                                    .catch(() => {
                                        setState({ status: "done", url, report: result.report!, screenshotBase64: null });
                                    });
                            } else if (result.status === "FAILED") {
                                if (pollRef.current) clearInterval(pollRef.current);
                                setState({ status: "failed", url, reason: result.failureReason ?? "Something went wrong." });
                            } else {
                                setState((s) =>
                                    s.status === "polling"
                                        ? { ...s, phase: result.status as "PENDING" | "SCANNING" | "ANALYZING" }
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
                    reason: err instanceof Error ? err.message : "Failed to start the scan.",
                });
            });
    }, [urlInput]);

    const handleReset = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        setState({ status: "idle" });
        setUrlInput("");
    }, []);

    const isBusy = state.status === "polling";
    const overallScore = state.status === "done" ? state.report.overallScore : 0;
    const { grade, color: gradeColor, bg: gradeBg } = gradeLabel(overallScore);

    if (mode === "seo") {
        return <SeoAuditView initialUrl={initialUrl} modeToggle={<ModeToggle mode={mode} onChange={setMode} />} />;
    }

    return (
        <AnalyzeShell
            showHero={state.status === "idle"}
            modeToggle={<ModeToggle mode={mode} onChange={setMode} />}
            headline={
                <>
                    Full AI Analysis Of Your
                    <br />
                    <span className="text-blue-500"> Website&apos;s Design</span>
                </>
            }
            subtext={
                <>
                    Score visual hierarchy, color, typography, copy, and content
                    <br />
                    with actionable insights across the whole page.
                </>
            }
            urlInput={urlInput}
            onUrlChange={setUrlInput}
            onSubmit={handleScan}
            onClear={handleReset}
            isBusy={isBusy}
            isDone={state.status === "done" || state.status === "failed"}
            submitLabel="Analyze"
            submitBusyLabel="Scanning…"
            placeholder="yourwebsite.com or paste full URL"
            accentGradient="bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            accentRing="focus-within:border-blue-300 focus-within:ring-blue-100"
        >
            {state.status === "polling" && (
                <div className="flex flex-col items-center justify-center flex-1 gap-6 px-6 py-12">
                    <div className="relative w-20 h-20">
                        <div className="absolute inset-0 rounded-full border-4 border-base" />
                        <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-blue-500">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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
                            <p className="text-sm font-semibold text-pri">Couldn&apos;t analyze that page</p>
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
                                    {overallScore >= 80 ? "Production ready" : overallScore >= 60 ? "Needs improvement" : "Critical issues"}
                                </span>
                            </div>
                            <p className="text-sm text-sec leading-relaxed truncate">{state.url}</p>
                            <p className="text-xs text-mut">5 research-backed criteria analyzed</p>
                        </div>

                        {state.screenshotBase64 && (
                            <img
                                src={`data:image/png;base64,${state.screenshotBase64}`}
                                alt="Page screenshot"
                                className="w-24 h-auto rounded-xl border border-base object-cover self-stretch shrink-0"
                            />
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl">
                        {CRITERION_KEYS.map((key) => (
                            <CriterionCard key={key} criterionKey={key} result={state.report[key]} />
                        ))}
                    </div>

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
                            Scan another URL
                        </button>
                    </div>
                </div>
            )}
        </AnalyzeShell>
    );
}
