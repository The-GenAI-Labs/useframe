"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { replicateApi } from "@/lib/api/services/replicate.service";
import { isFreeReplicationExhausted } from "@/lib/freeTierError";

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
                router.push(`/project/${result.slug}`);
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

    return (
        <div className="flex h-full w-full flex-col items-center justify-center px-6">
            <div className="flex w-full max-w-lg flex-col items-center gap-4 text-center">
                <h1 className="text-2xl font-bold text-pri tracking-tight">Replicate a website</h1>

                <form onSubmit={handleSubmit} className="flex w-full items-center gap-2">
                    <input
                        type="url"
                        required
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com/pricing"
                        disabled={status === "queued"}
                        className="flex-1 rounded-2xl border border-base bg-surface px-4 py-2.5 text-[13.5px] text-pri placeholder:text-mut outline-none focus:border-em disabled:opacity-60"
                    />
                    <button
                        type="submit"
                        disabled={status === "queued" || !url.trim()}
                        className="shrink-0 rounded-2xl px-5 py-2.5 text-[13px] font-semibold shadow-sm transition-all disabled:opacity-50"
                        style={{ backgroundColor: "var(--text-primary)", color: "var(--bg-primary)" }}
                    >
                        {status === "queued" ? "Queuing…" : "Go"}
                    </button>
                </form>

                <p className="text-xs text-mut leading-relaxed">
                    Enter the exact page URL you want to replicate.
                    <br />
                    Each URL is processed as a separate generation.
                </p>

                {status === "error" && (
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                )}
            </div>
        </div>
    );
}
