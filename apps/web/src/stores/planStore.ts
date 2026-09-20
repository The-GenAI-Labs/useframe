import { create } from "zustand"
import type { DesignBrief, PipelineStage } from "@repo/schemas"

// Mirrors generationStore's shape for the new /plan SSE flow (competitor
// research + design brief compilation), kept separate since it's a distinct
// stream with its own terminal event (brief_ready) rather than version_ready.
interface PlanState {
  currentStage: PipelineStage | null
  stageMessage: string
  brief: DesignBrief | null
  competitorInsights: Record<string, unknown> | null
  isStreaming: boolean
  error: string | null

  setStage: (stage: PipelineStage, message: string) => void
  setBriefReady: (brief: DesignBrief, competitorInsights?: Record<string, unknown>) => void
  setError: (message: string) => void
  setStreaming: (isStreaming: boolean) => void
  reset: () => void
}

const initial = {
  currentStage: null as PipelineStage | null,
  stageMessage: "",
  brief: null as DesignBrief | null,
  competitorInsights: null as Record<string, unknown> | null,
  isStreaming: false,
  error: null as string | null,
}

export const usePlanStore = create<PlanState>()((set) => ({
  ...initial,

  setStage: (stage, message) => set({ currentStage: stage, stageMessage: message }),

  setBriefReady: (brief, competitorInsights) =>
    set({ brief, competitorInsights: competitorInsights ?? null, isStreaming: false }),

  setError: (message) => set({ error: message, isStreaming: false }),
  setStreaming: (isStreaming) => set({ isStreaming }),

  reset: () => set(initial),
}))
