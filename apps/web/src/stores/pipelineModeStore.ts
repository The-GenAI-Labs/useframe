import { create } from "zustand"
import { persist } from "zustand/middleware"

export type PipelineMode = "AUTO" | "MANUAL"

interface PipelineModeState {
  defaultMode: PipelineMode
  setDefaultMode: (mode: PipelineMode) => void
}

// Default mode a new project starts with — set from the home page's
// chat input toggle. Once inside a project, the real mode lives on
// PipelineState in the DB; this store only seeds it at creation time.
export const usePipelineModeStore = create<PipelineModeState>()(
  persist(
    (set) => ({
      defaultMode: "AUTO",
      setDefaultMode: (mode) => set({ defaultMode: mode }),
    }),
    { name: "uf-pipeline-mode" },
  ),
)
