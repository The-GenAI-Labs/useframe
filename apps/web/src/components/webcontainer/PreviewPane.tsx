"use client"

import { useEffect, useRef, useState } from "react"
import { useWebContainer } from "./useWebContainer"
import { CitationTooltip } from "./CitationTooltip"
import type { SiteSpec } from "@repo/schemas"

type Props = {
  siteSpec: SiteSpec
  active: boolean
}

type HoverState = { citationIds: string[]; rect: { top: number; left: number; width: number; height: number } } | null

export function PreviewPane({ siteSpec, active }: Props) {
  const { state, boot } = useWebContainer()
  const [hover, setHover] = useState<HoverState>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!active) return
    boot(siteSpec)
  }, [active, siteSpec, boot])

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
      <>
        <iframe
          ref={iframeRef}
          src={state.url}
          className="h-full w-full border-0"
          allow="cross-origin-isolated"
          title="Site preview"
        />
        {hover && (
          <CitationTooltip
            citationIds={hover.citationIds}
            citations={siteSpec.citations}
            rect={hover.rect}
          />
        )}
      </>
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
