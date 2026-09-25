"use client"

import { useCallback, useState } from "react"
import { useSSE } from "./useSSE"
import type { SSEEvent, SiteSpec } from "@repo/schemas"

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

  const startGeneration = useCallback(
    (orchestratorUrl: string, payload: Record<string, unknown>) => {
      setState({ ...initial, isStreaming: true })

      connect(`${orchestratorUrl}/replicate/generate`, payload, {
        onEvent: (event: SSEEvent) => {
          if (event.type === "stage") {
            setState((s) => ({ ...s, stageMessage: event.message }))
          } else if (event.type === "version_ready") {
            setState((s) => ({ ...s, siteSpec: event.snapshot as SiteSpec, isStreaming: false }))
          } else if (event.type === "error") {
            setState((s) => ({ ...s, error: event.message, isStreaming: false }))
          }
        },
        onError: (err) => setState((s) => ({ ...s, error: err.message, isStreaming: false })),
        onDone: () => setState((s) => ({ ...s, isStreaming: false })),
      })
    },
    [connect]
  )

  const setSiteSpec = useCallback((spec: SiteSpec) => {
    setState((s) => ({ ...s, siteSpec: spec }))
  }, [])

  return { ...state, startGeneration, stopGeneration: disconnect, setSiteSpec }
}
