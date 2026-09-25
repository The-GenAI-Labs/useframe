"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { SiteSpec, DesignBrief } from "@repo/schemas"
import { useReplicationStream } from "@/hooks/useReplicationStream"
import { replicateApi, type ReplicationDetail } from "@/lib/api/services/replicate.service"
import { PreviewPane } from "@/components/webcontainer/PreviewPane"
import { BuildChatBar } from "./BuildChatBar"

const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001"

const STATUS_LABELS: Record<string, string> = {
  QUEUED: "Queuing replication…",
  RENDERING: "Loading the page…",
  EXTRACTING: "Capturing scroll behaviour…",
  ANALYZING: "Analysing design and layout…",
  GENERATING: "Building your replica…",
}

function hasSnapshot(snapshot: unknown): snapshot is SiteSpec {
  return !!snapshot && typeof snapshot === "object" && Array.isArray((snapshot as SiteSpec).pages)
}

type Props = {
  replication: ReplicationDetail
}

export default function ReplicationBuildView({ replication }: Props) {
  const { startGeneration, isStreaming, stageMessage, siteSpec, error, setSiteSpec } = useReplicationStream()
  const [current, setCurrent] = useState(replication)
  const generationStarted = useRef(false)

  const alreadyReady = hasSnapshot(current.snapshot)

  const { data: polled } = useQuery({
    queryKey: ["replication", replication.slug],
    queryFn: () => replicateApi.getBySlug(replication.slug),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "READY" || status === "FAILED" ? false : 2000
    },
    enabled: !alreadyReady,
    initialData: replication,
  })

  useEffect(() => {
    if (polled) setCurrent(polled)
  }, [polled])

  useEffect(() => {
    if (generationStarted.current || alreadyReady) return
    if (current.status !== "GENERATING" || !current.designBrief) return

    generationStarted.current = true
    startGeneration(ORCHESTRATOR_URL, {
      replicationId: current.id,
      sourceUrl: current.sourceUrl,
      designBrief: current.designBrief as unknown as DesignBrief,
      tier: current.tier === "FREE" ? "free" : "paid",
    })
  }, [current, alreadyReady, startGeneration])

  const activeSpec: SiteSpec | null = siteSpec ?? (hasSnapshot(current.snapshot) ? current.snapshot : null)
  const isBuilding = !activeSpec && (isStreaming || current.status !== "FAILED")
  const failed = current.status === "FAILED" || !!error

  const handleIterate = useCallback(
    async (content: string) => {
      const result = await replicateApi.sendMessage(replication.slug, content)
      if (result.changed && hasSnapshot(result.snapshot)) {
        setSiteSpec(result.snapshot)
      }
      return result
    },
    [replication.slug, setSiteSpec]
  )

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className="flex-1 min-h-0 relative">
        {activeSpec ? (
          <PreviewPane siteSpec={activeSpec} active />
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-semibold text-pri">Replication failed</p>
            <p className="text-xs text-mut max-w-sm">{error ?? current.failureReason ?? "Something went wrong."}</p>
          </div>
        ) : isBuilding ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <div>
              <p className="text-sm font-semibold text-pri">
                {isStreaming ? stageMessage || "Building your replica…" : STATUS_LABELS[current.status] ?? "Please wait…"}
              </p>
              <p className="mt-1 text-xs text-mut">{current.sourceUrl}</p>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-sm text-mut">Loading…</p>
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-base bg-surface px-4 py-3 md:px-8">
        <BuildChatBar onSubmit={handleIterate} disabled={!activeSpec} />
      </div>
    </div>
  )
}
