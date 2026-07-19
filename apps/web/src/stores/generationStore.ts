import { create } from "zustand"
import type { SiteSpec, PipelineStage } from "@repo/schemas"

export type SectionState = {
  pageSlug: string
  sectionType: string
  sectionIndex: number
  done: boolean
}

interface GenerationState {
  currentStage: PipelineStage | null
  stageMessage: string
  streamBuffer: string
  sections: SectionState[]
  siteSpec: SiteSpec | null
  isStreaming: boolean
  error: string | null

  setStage: (stage: PipelineStage, message: string) => void
  appendToken: (delta: string) => void
  markSectionDone: (pageSlug: string, sectionType: string, sectionIndex: number) => void
  setSiteSpec: (spec: SiteSpec) => void
  setError: (message: string) => void
  setStreaming: (isStreaming: boolean) => void
  reset: () => void
}

const initial = {
  currentStage: null as PipelineStage | null,
  stageMessage: "",
  streamBuffer: "",
  sections: [] as SectionState[],
  siteSpec: null as SiteSpec | null,
  isStreaming: false,
  error: null as string | null,
}

export const useGenerationStore = create<GenerationState>()((set) => ({
  ...initial,

  setStage: (stage, message) =>
    set({ currentStage: stage, stageMessage: message }),

  appendToken: (delta) =>
    set((s) => ({ streamBuffer: s.streamBuffer + delta })),

  markSectionDone: (pageSlug, sectionType, sectionIndex) =>
    set((s) => ({
      sections: [
        ...s.sections.filter(
          (sec) =>
            !(sec.pageSlug === pageSlug && sec.sectionIndex === sectionIndex)
        ),
        { pageSlug, sectionType, sectionIndex, done: true },
      ],
    })),

  setSiteSpec: (spec) => set({ siteSpec: spec, isStreaming: false }),
  setError: (message) => set({ error: message, isStreaming: false }),
  setStreaming: (isStreaming) => set({ isStreaming }),

  reset: () => set(initial),
}))
