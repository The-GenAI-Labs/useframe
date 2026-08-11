"use client"

import { useCallback, useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { projectsApi } from "@/lib/api/services/projects.service"
import { useGenerationStore } from "@/stores/generationStore"
import { GenerationStream } from "./GenerationStream"
import { PreviewPane } from "@/components/webcontainer/PreviewPane"
import type { SiteSpec } from "@repo/schemas"

type VersionItem = {
    id: string
    versionNumber: number
    label: string | null
    siteType: string
    snapshot: unknown
    createdAt: string
}

type Props = {
    slug: string
    versions: VersionItem[]
    generatingVersionId: string | null
}

function hasSnapshot(snapshot: unknown): snapshot is SiteSpec {
    return !!snapshot && typeof snapshot === "object" && Array.isArray((snapshot as SiteSpec).pages)
}

export function VersionSlider({ slug, versions, generatingVersionId }: Props) {
    const [activeIndex, setActiveIndex] = useState(0)
    const trackRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const queryClient = useQueryClient()
    const { isStreaming } = useGenerationStore()

    const createVersionMutation = useMutation({
        mutationFn: () => projectsApi.createVersion(slug),
        onSuccess: () => {
            router.push(`/project/${slug}?status=generating`)
            router.refresh()
            queryClient.invalidateQueries({ queryKey: ["project", slug] })
        },
    })

    const scrollToIndex = useCallback((index: number) => {
        const track = trackRef.current
        if (!track) return
        const clamped = Math.max(0, Math.min(index, versions.length - 1))
        track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" })
        setActiveIndex(clamped)
    }, [versions.length])

    if (versions.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-[13px] text-mut">No generations yet.</p>
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-base px-4 py-2.5 shrink-0">
                <div className="flex items-center gap-1.5">
                    {versions.map((v, i) => (
                        <button
                            key={v.id}
                            onClick={() => scrollToIndex(i)}
                            title={`Version ${v.versionNumber}`}
                            className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
                                i === activeIndex ? "w-6 bg-pri" : "w-1.5 bg-tertiary hover:bg-bubble"
                            }`}
                        />
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[12px] text-mut">
                        Version {versions[activeIndex]?.versionNumber} of {versions.length}
                    </span>
                    <button
                        onClick={() => createVersionMutation.mutate()}
                        disabled={createVersionMutation.isPending || isStreaming}
                        className="flex items-center gap-1.5 rounded-lg bg-bubble px-2.5 py-1.5 text-[12px] font-semibold text-pri transition-opacity duration-150 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        {createVersionMutation.isPending ? "Starting..." : "New generation"}
                    </button>
                </div>
            </div>

            <div className="relative flex-1 overflow-hidden">
                <div
                    ref={trackRef}
                    className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
                    style={{ scrollbarWidth: "none" }}
                    onScroll={(e) => {
                        const track = e.currentTarget
                        const index = Math.round(track.scrollLeft / track.clientWidth)
                        if (index !== activeIndex) setActiveIndex(index)
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
        </div>
    )
}
