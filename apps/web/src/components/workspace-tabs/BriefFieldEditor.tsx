"use client"

import { useState, useCallback, useEffect } from "react"
import { researchApi, type ResearchFinding } from "@/lib/api/services/research.service"

type Props = {
    slug: string
    citation: string
    onPick: (option: { value: string; label: string }) => void
    onClose: () => void
}

export function BriefFieldEditor({ slug, citation, onPick, onClose }: Props) {
    const [state, setState] = useState<
        | { status: "loading" }
        | { status: "ready"; finding: ResearchFinding }
        | { status: "error" }
    >({ status: "loading" })

    useEffect(() => {
        let cancelled = false
        researchApi
            .getFinding(slug, citation)
            .then((finding) => {
                if (!cancelled) setState({ status: "ready", finding })
            })
            .catch(() => {
                if (!cancelled) setState({ status: "error" })
            })
        return () => {
            cancelled = true
        }
    }, [slug, citation])

    const handlePick = useCallback(
        (option: { value: string; label: string }) => {
            onPick(option)
            onClose()
        },
        [onPick, onClose]
    )

    return (
        <div className="flex flex-col gap-2 p-3 rounded-xl border border-base bg-tertiary">
            {state.status === "loading" && (
                <p className="text-[11.5px] text-mut">Loading options…</p>
            )}
            {state.status === "error" && (
                <p className="text-[11.5px] text-mut">Couldn&apos;t load options for this finding.</p>
            )}
            {state.status === "ready" && (
                <>
                    <p className="text-[11px] text-mut leading-relaxed">{state.finding.claim}</p>
                    <div className="flex flex-wrap gap-1.5">
                        {state.finding.options.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => handlePick(opt)}
                                className="px-2.5 py-1 rounded-lg border border-base bg-surface text-[11px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer"
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </>
            )}
            <button
                type="button"
                onClick={onClose}
                className="text-[11px] text-mut hover:text-sec transition-colors cursor-pointer self-start"
            >
                Cancel
            </button>
        </div>
    )
}
