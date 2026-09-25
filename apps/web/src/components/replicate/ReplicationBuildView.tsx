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

const POLL_INTERVAL_MS = 10_000
const POLL_TIMEOUT_MS = 30 * 60 * 1000
const POLL_FAILURE_LIMIT = 5

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
  const [timedOut, setTimedOut] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const generationStarted = useRef(false)
  const startedAt = useRef(Date.now())
  const consecutiveFailures = useRef(0)

  const alreadyReady = hasSnapshot(current.snapshot) || !!siteSpec

  const { data: polled } = useQuery({
    queryKey: ["replication", replication.slug],
    queryFn: async () => {
      try {
        const result = await replicateApi.getBySlug(replication.slug)
        consecutiveFailures.current = 0
        setPollError(null)
        return result
      } catch (err) {
        consecutiveFailures.current += 1
        if (consecutiveFailures.current >= POLL_FAILURE_LIMIT) {
          setPollError("Lost connection while checking status. Please try again in a few minutes.")
        }
        throw err
      }
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === "READY" || status === "FAILED") return false
      if (timedOut || pollError || error) return false
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return false
      }
      return POLL_INTERVAL_MS
    },
    retry: POLL_FAILURE_LIMIT,
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
      designBrief: { ...current.designBrief, citations: [] } as unknown as DesignBrief,
      tier: current.tier === "FREE" ? "free" : "paid",
    })
  }, [current, alreadyReady, startGeneration])

  useEffect(() => {
    if (isStreaming) startedAt.current = Date.now()
  }, [isStreaming])

  const activeSpec: SiteSpec | null = siteSpec ?? (hasSnapshot(current.snapshot) ? current.snapshot : null)
  const failed = current.status === "FAILED" || !!error
  const isBuilding = !activeSpec && !failed && !timedOut && !pollError

  const handleRetry = useCallback(() => {
    startedAt.current = Date.now()
    consecutiveFailures.current = 0
    setTimedOut(false)
    setPollError(null)
  }, [])

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
        ) : timedOut ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-semibold text-pri">This is taking longer than expected</p>
            <p className="text-xs text-mut max-w-sm">
              We stopped checking after 30 minutes. Please try again in a little while.
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-1 px-4 py-2 rounded-xl border border-base text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer"
            >
              Check again
            </button>
          </div>
        ) : pollError ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-semibold text-pri">Something went wrong</p>
            <p className="text-xs text-mut max-w-sm">{pollError}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-1 px-4 py-2 rounded-xl border border-base text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary transition-all cursor-pointer"
            >
              Try again
            </button>
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
