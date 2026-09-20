"use client"

import { useEffect, useState } from "react"
import { findingsApi } from "@/lib/api/services/findings.service"

type Citation = {
    id: string
    title: string
    source: string
    url?: string
}

type HoverRect = { top: number; left: number; width: number; height: number }

type Props = {
    citationIds: string[]
    citations: Citation[]
    rect: HoverRect | null
}

export function CitationTooltip({ citationIds, citations, rect }: Props) {
    const primaryId = citationIds[0]
    const citation = citations.find((c) => c.id === primaryId)
    const [verified, setVerified] = useState<boolean | null>(null)

    useEffect(() => {
        if (!primaryId) return
        let cancelled = false
        findingsApi
            .get(primaryId)
            .then((finding) => {
                if (!cancelled) setVerified(finding.verified)
            })
            .catch(() => {
                if (!cancelled) setVerified(null)
            })
        return () => {
            cancelled = true
        }
    }, [primaryId])

    const visible = !!rect && !!citation

    if (!primaryId) return null

    return (
        <div
            className="fixed z-50 max-w-xs rounded-xl border border-base bg-surface p-3 shadow-lg transition-all duration-150 ease-out"
            style={{
                top: rect ? rect.top - 96 : 0,
                left: rect ? rect.left : 0,
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(4px)",
                pointerEvents: "none",
            }}
        >
            {citation && (
                <>
                    <div className="flex items-center gap-1.5 mb-1.5">
                        <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                verified
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                    : "bg-tertiary text-mut"
                            }`}
                        >
                            {verified ? "Science-proved" : "AI-inferred"}
                        </span>
                        {citationIds.length > 1 && (
                            <span className="text-[10px] text-mut">+{citationIds.length - 1} more</span>
                        )}
                    </div>
                    <p className="text-[12px] text-sec leading-relaxed">{citation.title}</p>
                    <p className="text-[11px] text-mut italic mt-1">{citation.source}</p>
                    <a
                        href={`/research/${primaryId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-medium text-blue-500 hover:text-blue-600 mt-1.5 inline-block"
                        style={{ pointerEvents: "auto" }}
                    >
                        Read the finding →
                    </a>
                </>
            )}
        </div>
    )
}
