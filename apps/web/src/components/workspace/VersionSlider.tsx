"use client"

import { useCallback, useRef } from "react"
import type { SiteSpec } from "@repo/schemas"
import { GenerationStream } from "./GenerationStream"
import { PreviewPane } from "@/components/webcontainer/PreviewPane"

type VersionItem = {
    id: string
    versionNumber: number
    label: string | null
    siteType: string
    snapshot: unknown
    createdAt: string
}

type Props = {
    versions: VersionItem[]
    generatingVersionId: string | null
    activeIndex: number
    onActiveIndexChange: (index: number) => void
}

function hasSnapshot(snapshot: unknown): snapshot is SiteSpec {
    return !!snapshot && typeof snapshot === "object" && Array.isArray((snapshot as SiteSpec).pages)
}

export function VersionSlider({ versions, generatingVersionId, activeIndex, onActiveIndexChange }: Props) {
    const trackRef = useRef<HTMLDivElement>(null)

    const scrollToIndex = useCallback((index: number) => {
        const track = trackRef.current
        if (!track) return
        const clamped = Math.max(0, Math.min(index, versions.length - 1))
        track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" })
        onActiveIndexChange(clamped)
    }, [versions.length, onActiveIndexChange])

    if (versions.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-[13px] text-mut">No generations yet.</p>
            </div>
        )
    }

    return (
        <div className="relative h-full overflow-hidden">
            <div
                ref={trackRef}
                className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
                style={{ scrollbarWidth: "none" }}
                onScroll={(e) => {
                    const track = e.currentTarget
                    const index = Math.round(track.scrollLeft / track.clientWidth)
                    if (index !== activeIndex) onActiveIndexChange(index)
                }}
            >
                {versions.map((version) => (
                    <div key={version.id} className="h-full w-full shrink-0 snap-start">
                        {version.id === generatingVersionId ? (
                            <GenerationStream />
                        ) : hasSnapshot(version.snapshot) ? (
                            <PreviewPane
                                siteSpec={version.snapshot}
                                active={version.id === versions[activeIndex]?.id}
                            />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                                <p className="text-[13px] text-mut">This version hasn&apos;t been generated yet.</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {versions.length > 1 && (
                <>
                    <button
                        onClick={() => scrollToIndex(activeIndex - 1)}
                        disabled={activeIndex === 0}
                        aria-label="Previous version"
                        className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-card border border-base text-sec shadow-lg transition-opacity duration-150 hover:opacity-90 disabled:opacity-0 disabled:pointer-events-none cursor-pointer"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                    <button
                        onClick={() => scrollToIndex(activeIndex + 1)}
                        disabled={activeIndex === versions.length - 1}
                        aria-label="Next version"
                        className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-card border border-base text-sec shadow-lg transition-opacity duration-150 hover:opacity-90 disabled:opacity-0 disabled:pointer-events-none cursor-pointer"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </button>
                </>
            )}
        </div>
    )
}
