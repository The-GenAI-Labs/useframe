"use client";

import { use, useEffect, useState } from "react";
import { findingsApi, type PublicFinding } from "@/lib/api/services/findings.service";

type State =
    | { status: "loading" }
    | { status: "ready"; finding: PublicFinding }
    | { status: "error" };

export default function FindingPage({
    params,
}: {
    params: Promise<{ findingId: string }>;
}) {
    const { findingId } = use(params);
    const [state, setState] = useState<State>({ status: "loading" });

    useEffect(() => {
        let cancelled = false;
        findingsApi
            .get(findingId)
            .then((finding) => {
                if (!cancelled) setState({ status: "ready", finding });
            })
            .catch(() => {
                if (!cancelled) setState({ status: "error" });
            });
        return () => {
            cancelled = true;
        };
    }, [findingId]);

    return (
        <div className="min-h-screen flex items-start justify-center px-6 py-16" style={{ backgroundColor: "var(--bg-shell)" }}>
            <div className="w-full max-w-xl flex flex-col gap-4">
                {state.status === "loading" && (
                    <div className="flex justify-center py-16">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                    </div>
                )}

                {state.status === "error" && (
                    <div className="text-center py-16">
                        <p className="text-sm font-medium text-pri">Couldn&apos;t load this finding</p>
                        <p className="text-xs text-mut mt-1">It may have been removed or the link is invalid.</p>
                    </div>
                )}

                {state.status === "ready" && (
                    <>
                        <div className="flex items-center gap-2">
                            <span
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                    state.finding.verified
                                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                        : "bg-tertiary text-mut"
                                }`}
                            >
                                {state.finding.verified ? "Science-proved" : "AI-inferred"}
                            </span>
                            <span className="text-[11px] text-mut uppercase tracking-wide">{state.finding.field}</span>
                        </div>

                        <h1 className="text-2xl font-bold text-pri leading-snug">{state.finding.claim}</h1>

                        <p className="text-sm text-sec leading-relaxed">{state.finding.paper}</p>

                        <div className="mt-4 p-4 rounded-2xl border border-base bg-surface">
                            <p className="text-[11px] font-semibold text-mut uppercase tracking-wide mb-1.5">Context</p>
                            <p className="text-[13px] text-sec leading-relaxed">{state.finding.contextHeader}</p>
                        </div>

                        {state.finding.options.length > 0 && (
                            <div className="mt-2 flex flex-col gap-2">
                                <p className="text-[11px] font-semibold text-mut uppercase tracking-wide">Options considered</p>
                                {state.finding.options.map((opt) => (
                                    <div key={opt.value} className="p-3 rounded-xl border border-base bg-surface">
                                        <p className="text-[12.5px] font-medium text-pri">{opt.label}</p>
                                        {opt.fits.length > 0 && (
                                            <p className="text-[11px] text-mut mt-0.5">Fits: {opt.fits.join(", ")}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
