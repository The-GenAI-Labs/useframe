"use client"

import { useCallback } from "react"
import { useSSE } from "./useSSE"
import { usePlanStore } from "@/stores/planStore"
import type { SSEEvent, Tier, ExtractedFields } from "@repo/schemas"

type PlanPayload = {
  projectId: string
  versionId: string
  tier: Tier
  ideaText: string
  niche: string
  targetAudience: string
  sourceUrl?: string
  extracted?: ExtractedFields
}

type StartPlanOptions = {
  onBriefReady?: (brief: NonNullable<ReturnType<typeof usePlanStore.getState>["brief"]>) => void
}

// Same fetch-based SSE reader as useGenerationStream (via useSSE), pointed at
// orchestrator-service's /plan endpoint instead of /generate. Kept as its
// own hook rather than folded into useGenerationStream since the terminal
// event differs (brief_ready vs version_ready) and the two streams are never
// open at the same time for a given project.
export function usePlanStream() {
  const { connect, disconnect } = useSSE()
  const { setStage, setBriefReady, setCandidatesReady, setError, setStreaming, reset } =
    usePlanStore()

  const startPlan = useCallback(
    (orchestratorUrl: string, payload: PlanPayload, options?: StartPlanOptions) => {
      reset()
      setStreaming(true)

      connect(`${orchestratorUrl}/plan`, payload, {
        onEvent: (event: SSEEvent) => {
          switch (event.type) {
            case "stage":
              setStage(event.stage, event.message)
              break
            case "brief_ready":
              setBriefReady(event.brief, event.competitorInsights as Record<string, unknown> | undefined)
              options?.onBriefReady?.(event.brief)
              break
            case "candidates_ready":
              // Terminal event of the two-candidate flow. Nothing auto-
              // proceeds from here — the picker drives /research/select.
              setCandidatesReady(
                {
                  candidateA: event.candidateA,
                  candidateB: event.candidateB,
                  recommended: event.recommended,
                  recommendedReason: event.recommendedReason,
                },
                event.competitorInsights as Record<string, unknown> | undefined,
              )
              break
            case "error":
              setError(event.message)
              break
            default:
              break
          }
        },
        onError: (err) => setError(err.message),
        onDone: () => setStreaming(false),
      })
    },
    [connect, reset, setStage, setBriefReady, setCandidatesReady, setError, setStreaming],
  )

  return { startPlan, stopPlan: disconnect }
}
