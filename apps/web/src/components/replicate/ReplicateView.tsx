"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { replicateApi } from "@/lib/api/services/replicate.service";
import { isFreeReplicationExhausted } from "@/lib/freeTierError";
import { CrossLineBackground } from "@/components/web-score/CrossLineBackground";
import { serif } from "@/components/home/fonts";

export default function ReplicateView() {
    const router = useRouter();
    const [url, setUrl] = useState("");
    const [status, setStatus] = useState<"idle" | "queued" | "error">("idle");
    const [error, setError] = useState("");

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!url.trim() || status === "queued") return;

            setStatus("queued");
            setError("");
            try {
                const result = await replicateApi.create(url.trim());
                router.push(`/build/${result.slug}`);
            } catch (err) {
                if (isFreeReplicationExhausted(err)) {
                    router.push("/billing");
                    return;
                }
                setStatus("error");
                setError(err instanceof Error ? err.message : "Couldn't start replication");
            }
        },
        [url, status, router]
    );

    const isBusy = status === "queued";

    return (
        <div className="relative flex h-full w-full flex-col overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            <CrossLineBackground />

            <div className="relative px-6 md:px-10 pt-6 shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-pri">Replicate</span>
                    <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ backgroundColor: "var(--bg-bubble)", color: "var(--text-secondary)" }}
                    >
                        CLONE
                    </span>
                </div>
            </div>

            <div className="relative flex-1 flex flex-col items-center justify-center px-6 pb-16 pt-4">
                <div className="relative w-16 h-16 mt-8">
                    <div className="absolute inset-0 -rotate-12 rounded-2xl flex items-center justify-center shadow-xl ring-1 ring-white/40 overflow-hidden z-10 bg-linear-to-br from-blue-500 to-blue-700">
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
                        <svg width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="relative drop-shadow-sm rotate-12">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                            <path d="M10 6h5a2 2 0 0 1 2 2v5" />
                            <path d="M14 18H9a2 2 0 0 1-2-2v-5" />
                        </svg>
                    </div>
                </div>

                <h1 className={`${serif.className} text-5xl md:text-6xl text-pri tracking-tight text-center leading-[1.1] mt-8`}>
                    Replicate a website
                </h1>
                <p className="text-sm text-mut text-center mt-4 max-w-md">
                    Enter the exact page URL you want to replicate. Each URL is processed as its own generation — no auto-expanding to other pages.
                </p>

                <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-xl mt-8">
                    <div className="flex-1 flex items-center gap-2.5 px-5 py-3.5 rounded-full border border-base bg-surface shadow-sm focus-within:ring-2 focus-within:border-blue-300 focus-within:ring-blue-100 transition-all">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-mut shrink-0">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        <input
                            type="url"
                            required
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://example.com/pricing"
                            disabled={isBusy}
                            className="flex-1 bg-transparent text-[13.5px] text-sec placeholder:text-mut outline-none"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!url.trim() || isBusy}
                        className="flex items-center gap-1.5 px-6 py-3.5 rounded-full text-[13px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0 shadow-sm bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                    >
                        {isBusy ? "Queuing…" : "Go"}
                        {!isBusy && (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        )}
                    </button>
                </form>

                {status === "error" && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-4">{error}</p>
                )}
            </div>
        </div>
    );
}
