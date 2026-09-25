"use client"

import { useEffect } from "react"
import { useNextWebContainer } from "./useNextWebContainer"
import type { ReplicationNextFile } from "./nextScaffold"

type Props = {
  files: ReplicationNextFile[]
  active: boolean
}

export function NextPreviewPane({ files, active }: Props) {
  const { state, boot } = useNextWebContainer()

  useEffect(() => {
    if (!active) return
    boot(files)
  }, [active, files, boot])

  if (!active && state.status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-[13px] text-mut">Scroll to this version to load its preview.</p>
      </div>
    )
  }

  if (state.status === "ready") {
    return (
      <iframe
        src={state.url}
        className="h-full w-full border-0"
        allow="cross-origin-isolated"
        title="Site preview"
      />
    )
  }

  const labels: Record<string, string> = {
    idle: "Preparing preview...",
    booting: "Booting WebContainer...",
    installing: "Installing dependencies...",
    starting: "Starting Next.js dev server...",
    error: "Preview failed",
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      {state.status === "error" ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Preview unavailable</p>
          <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
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
