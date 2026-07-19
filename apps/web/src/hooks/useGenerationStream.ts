"use client"

import { useCallback } from "react"
import { useSSE } from "./useSSE.js"
import { useGenerationStore } from "@/stores/generationStore.js"
import type { SSEEvent, SiteSpec, ModelId } from "@repo/schemas"

type GeneratePayload = {
  projectId: string
  versionId: string
  startupIdea: string
  niche: string
  targetAudience: string
  inputType: string
  sourceUrl?: string
  scanResult?: Record<string, unknown>
  modelId?: ModelId
}

export function useGenerationStream() {
  const { connect, disconnect } = useSSE()
  const {
    setStage,
    appendToken,
    markSectionDone,
    setSiteSpec,
    setError,
    setStreaming,
    reset,
  } = useGenerationStore()

  const startGeneration = useCallback(
    (orchestratorUrl: string, payload: GeneratePayload) => {
      reset()
      setStreaming(true)

      connect(`${orchestratorUrl}/generate`, payload, {
        onEvent: (event: SSEEvent) => {
          switch (event.type) {
            case "stage":
              setStage(event.stage, event.message)
              break
            case "token":
              appendToken(event.delta)
              break
            case "section_complete":
              markSectionDone(
                event.pageSlug,
                event.sectionType,
                event.sectionIndex,
              )
              break
            case "version_ready":
              setSiteSpec(event.snapshot as SiteSpec)
              break
            case "error":
              setError(event.message)
              break
          }
        },
        onError: (err) => setError(err.message),
        onDone: () => setStreaming(false),
      })
    },
    [
      connect,
      reset,
      setStage,
      appendToken,
      markSectionDone,
      setSiteSpec,
      setError,
      setStreaming,
    ],
  )

  return { startGeneration, stopGeneration: disconnect }
}
