"use client"

import { useCallback, useRef, useState } from "react"
import { useSSE } from "./useSSE"
import type { SSEEvent, SiteSpec } from "@repo/schemas"

const STREAM_TIMEOUT_MS = 30 * 60 * 1000

type ReplicationStreamState = {
  isStreaming: boolean
  stageMessage: string
  siteSpec: SiteSpec | null
  error: string | null
}

const initial: ReplicationStreamState = {
  isStreaming: false,
  stageMessage: "",
  siteSpec: null,
  error: null,
}

export function useReplicationStream() {
  const { connect, disconnect } = useSSE()
  const [state, setState] = useState<ReplicationStreamState>(initial)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearStreamTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const startGeneration = useCallback(
    (orchestratorUrl: string, payload: Record<string, unknown>) => {
      setState({ ...initial, isStreaming: true })

      clearStreamTimeout()
      timeoutRef.current = setTimeout(() => {
        disconnect()
        setState((s) => ({
          ...s,
          isStreaming: false,
          error: "This is taking longer than expected. Please try again in a little while.",
        }))
      }, STREAM_TIMEOUT_MS)

      connect(`${orchestratorUrl}/replicate/generate`, payload, {
        onEvent: (event: SSEEvent) => {
          if (event.type === "stage") {
            setState((s) => ({ ...s, stageMessage: event.message }))
          } else if (event.type === "version_ready") {
            clearStreamTimeout()
            setState((s) => ({ ...s, siteSpec: event.snapshot as SiteSpec, isStreaming: false }))
          } else if (event.type === "error") {
            clearStreamTimeout()
            setState((s) => ({ ...s, error: event.message, isStreaming: false }))
          }
        },
        onError: (err) => {
          clearStreamTimeout()
          setState((s) => ({ ...s, error: err.message, isStreaming: false }))
        },
        onDone: () => {
          clearStreamTimeout()
          setState((s) => ({ ...s, isStreaming: false }))
        },
      })
    },
    [connect, disconnect, clearStreamTimeout]
  )

  const setSiteSpec = useCallback((spec: SiteSpec) => {
    setState((s) => ({ ...s, siteSpec: spec }))
  }, [])

  const stopGeneration = useCallback(() => {
    clearStreamTimeout()
    disconnect()
  }, [disconnect, clearStreamTimeout])

  return { ...state, startGeneration, stopGeneration, setSiteSpec }
}
