"use client"

import { useEffect, useRef, useState } from "react"
import { useWebContainer } from "./useWebContainer"
import { CitationTooltip } from "./CitationTooltip"
import type { SiteSpec } from "@repo/schemas"
import { mediaApi } from "@/lib/api/services/media.service"

type Props = {
  projectSlug: string
  siteSpec: SiteSpec
  active: boolean
}

type HoverState = { citationIds: string[]; rect: { top: number; left: number; width: number; height: number } } | null

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {expanded ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  )
}

export function PreviewPane({ projectSlug, siteSpec, active }: Props) {
  const { state, boot } = useWebContainer()
  const [hover, setHover] = useState<HoverState>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const frameBoxRef = useRef<HTMLDivElement>(null)
  const [nativeFullscreen, setNativeFullscreen] = useState(false)
  const [overlay, setOverlay] = useState(false)
  const expanded = nativeFullscreen || overlay

  useEffect(() => {
    const sync = () => setNativeFullscreen(document.fullscreenElement === frameBoxRef.current)
    document.addEventListener("fullscreenchange", sync)
    return () => document.removeEventListener("fullscreenchange", sync)
  }, [])

  useEffect(() => {
    if (!overlay) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOverlay(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [overlay])

  useEffect(() => {
    if (active) return
    setOverlay(false)
    if (document.fullscreenElement === frameBoxRef.current) void document.exitFullscreen()
  }, [active])

  // Browsers without the element Fullscreen API (iOS Safari) get a fixed overlay instead.
  const toggleFullscreen = () => {
    if (expanded) {
      setOverlay(false)
      if (document.fullscreenElement) void document.exitFullscreen()
    } else if (document.fullscreenEnabled && frameBoxRef.current) {
      frameBoxRef.current.requestFullscreen().catch(() => setOverlay(true))
    } else {
      setOverlay(true)
    }
  }

  useEffect(() => {
    if (!active) return
    let cancelled = false
    const assetIds = [...new Set(Object.values(siteSpec.media ?? {}).map((b) => b.assetId))]
    // The API mints signed media URLs; on failure the preview renders without media.
    const resolved = assetIds.length ? mediaApi.resolve(projectSlug, assetIds).catch(() => []) : Promise.resolve([])
    void resolved.then((assets) => {
      if (!cancelled) boot(siteSpec, assets)
    })
    return () => {
      cancelled = true
    }
  }, [active, siteSpec, projectSlug, boot])

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data
      if (!data || typeof data !== "object") return
      if (event.source !== iframeRef.current?.contentWindow) return

      if (data.type === "citation-hover" && Array.isArray(data.citationIds)) {
        // The iframe reports coordinates relative to its own viewport —
        // offset by the iframe's own position in the parent page so the
        // fixed-position tooltip lands in the right spot.
        const frameRect = iframeRef.current?.getBoundingClientRect()
        const r = data.rect
        setHover({
          citationIds: data.citationIds,
          rect: {
            top: (frameRect?.top ?? 0) + r.top,
            left: (frameRect?.left ?? 0) + r.left,
            width: r.width,
            height: r.height,
          },
        })
      } else if (data.type === "citation-hover-end") {
        setHover(null)
      }
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  if (!active && state.status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-[13px] text-mut">Scroll to this version to load its preview.</p>
      </div>
    )
  }

  if (state.status === "ready") {
    return (
      <div
        ref={frameBoxRef}
        className={
          overlay
            ? "fixed inset-0 z-[100] bg-surface"
            : "relative h-full w-full bg-surface"
        }
      >
        <iframe
          ref={iframeRef}
          src={state.url}
          className="h-full w-full border-0"
          allow="cross-origin-isolated"
          title="Site preview"
        />
        <button
          type="button"
          onClick={toggleFullscreen}
          aria-pressed={expanded}
          title={expanded ? "Exit full screen (Esc)" : "View full screen"}
          className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-2.5 py-1.5 text-[12px] font-semibold text-white opacity-80 shadow-lg backdrop-blur transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-white cursor-pointer"
        >
          <ExpandIcon expanded={expanded} />
          {expanded ? "Exit full screen" : "Full screen"}
        </button>
        {hover && (
          <CitationTooltip
            citationIds={hover.citationIds}
            citations={siteSpec.citations}
            rect={hover.rect}
          />
        )}
      </div>
    )
  }

  const labels: Record<string, string> = {
    idle: "Preparing preview...",
    booting: "Booting WebContainer...",
    installing: "Installing dependencies...",
    starting: "Starting dev server...",
    error: "Preview failed",
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      {state.status === "error" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Preview unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            The generated code is available in the Generation tab.
          </p>
        </div>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-muted-foreground">{labels[state.status]}</p>
        </>
      )}
    </div>
  )
}
