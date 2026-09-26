"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useReplicationStream } from "@/hooks/useReplicationStream"
import {
  replicateApi,
  type ReplicationDetail,
  type ReplicationNextFile,
} from "@/lib/api/services/replicate.service"
import { NextPreviewPane } from "@/components/webcontainer/NextPreviewPane"

const ORCHESTRATOR_URL = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4001"

const POLL_INTERVAL_MS = 10_000
const POLL_TIMEOUT_MS = 30 * 60 * 1000
const POLL_FAILURE_LIMIT = 5

const STATUS_LABELS: Record<string, string> = {
  QUEUED: "Queuing replication…",
  RENDERING: "Loading the page…",
  EXTRACTING: "Capturing scroll behaviour…",
  ANALYZING: "Analysing design and layout…",
  GENERATING: "Writing Next.js code…",
}

function hasFiles(files: unknown): files is ReplicationNextFile[] {
  return Array.isArray(files) && files.length > 0
}

type Props = {
  replication: ReplicationDetail
}

export default function ReplicationBuildView({ replication }: Props) {
  const { startGeneration, isStreaming, stageMessage, nextFiles, error } = useReplicationStream()
  const [current, setCurrent] = useState(replication)
  const [timedOut, setTimedOut] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const generationStarted = useRef(false)
  const startedAt = useRef(Date.now())
  const consecutiveFailures = useRef(0)

  const alreadyReady = hasFiles(current.nextFiles) || hasFiles(nextFiles)
  const isTerminal = alreadyReady || current.status === "FAILED"

  const { data: polled, refetch } = useQuery({
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
      if (status === "READY" || (status === "FAILED" && !isStreaming)) return false
      if (timedOut || pollError || error) return false
      if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return false
      }
      return POLL_INTERVAL_MS
    },
    retry: POLL_FAILURE_LIMIT,
    enabled: !isTerminal || isStreaming,
    initialData: replication,
  })

  useEffect(() => {
    if (polled) setCurrent(polled)
  }, [polled])

  useEffect(() => {
    if (generationStarted.current || alreadyReady) return
    if (current.status !== "GENERATING" || !current.buildSpec) return

    generationStarted.current = true
    startGeneration(ORCHESTRATOR_URL, {
      replicationId: current.id,
      buildSpec: current.buildSpec,
      tier: current.tier === "FREE" ? "free" : "paid",
    })
  }, [current, alreadyReady, startGeneration])

  useEffect(() => {
    if (isStreaming) startedAt.current = Date.now()
    else if (generationStarted.current) void refetch()
  }, [isStreaming, refetch])

  const activeFiles: ReplicationNextFile[] | null = hasFiles(nextFiles)
    ? nextFiles
    : hasFiles(current.nextFiles)
      ? current.nextFiles
      : null
  const failed = (current.status === "FAILED" && !isStreaming) || !!error
  const isBuilding = !activeFiles && !failed && !timedOut && !pollError

  const handleRetry = useCallback(() => {
    startedAt.current = Date.now()
    consecutiveFailures.current = 0
    setTimedOut(false)
    setPollError(null)
  }, [])

  const handleGenerationRetry = useCallback(() => {
    if (!current.buildSpec || isStreaming) return
    handleRetry()
    generationStarted.current = true
    setCurrent((value) => ({
      ...value,
      status: "GENERATING",
      failureReason: null,
    }))
    startGeneration(ORCHESTRATOR_URL, {
      replicationId: current.id,
      buildSpec: current.buildSpec,
      tier: current.tier === "FREE" ? "free" : "paid",
    })
  }, [current, handleRetry, isStreaming, startGeneration])

  return (
    <div className="flex h-full w-full flex-col bg-surface">
      <div className="flex-1 min-h-0 relative">
        {activeFiles ? (
          <NextPreviewPane files={activeFiles} active />
        ) : failed ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-semibold text-pri">Replication failed</p>
            <p className="text-xs text-mut max-w-sm">
              {error ?? current.failureReason ?? "Something went wrong."}
            </p>
            {current.buildSpec && (
              <button
                type="button"
                disabled={isStreaming}
                onClick={handleGenerationRetry}
                className="mt-1 rounded-xl border border-base px-4 py-2 text-[12.5px] font-medium text-sec hover:border-em hover:bg-tertiary focus-visible:outline focus-visible:outline-2 disabled:opacity-50"
              >
                Retry generation
              </button>
            )}
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
                {isStreaming
                  ? stageMessage || "Writing Next.js code…"
                  : (STATUS_LABELS[current.status] ?? "Please wait…")}
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
    </div>
  )
}
