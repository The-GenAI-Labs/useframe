import { create } from "zustand"
import { persist } from "zustand/middleware"

export type ProjectMeta = {
  id: string
  slug: string
  name: string
  status: string
  inputType: string
}

export type VersionMeta = {
  id: string
  versionNumber: number
}

interface ProjectState {
  currentProject: ProjectMeta | null
  currentVersion: VersionMeta | null
  setProject: (project: ProjectMeta, version: VersionMeta) => void
  clearProject: () => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      currentProject: null,
      currentVersion: null,
      setProject: (project, version) =>
        set({ currentProject: project, currentVersion: version }),
      clearProject: () =>
        set({ currentProject: null, currentVersion: null }),
    }),
    { name: "uf-project" }
  )
)
