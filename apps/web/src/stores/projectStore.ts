import { create } from "zustand"
import { persist } from "zustand/middleware"
import { projectsApi } from "@/lib/api/services/projects.service"

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
  label?: string | null
  siteType?: string
  snapshot?: unknown
  createdAt?: string
}

interface ProjectState {
  currentProject: ProjectMeta | null
  currentVersion: VersionMeta | null
  versions: VersionMeta[]
  setProject: (project: ProjectMeta, version: VersionMeta) => void
  clearProject: () => void
  setVersions: (versions: VersionMeta[]) => void
  addVersion: (version: VersionMeta) => void
  switchVersion: (id: string) => Promise<void>
  restoreVersion: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      currentProject: null,
      currentVersion: null,
      versions: [],

      setProject: (project, version) =>
        set({ currentProject: project, currentVersion: version }),

      clearProject: () =>
        set({ currentProject: null, currentVersion: null, versions: [] }),

      setVersions: (versions) => set({ versions }),

      addVersion: (version) =>
        set((s) => ({
          versions: [version, ...s.versions.filter((v) => v.id !== version.id)],
        })),

      switchVersion: async (id) => {
        const { versions, currentProject } = get()
        const cached = versions.find((v) => v.id === id)
        if (cached) {
          set({ currentVersion: cached })
          return
        }
        if (!currentProject) return
        const { snapshot } = await projectsApi.getVersionSnapshot(
          currentProject.slug,
          id
        )
        const fallback: VersionMeta = {
          id,
          versionNumber: 0,
          label: null,
          siteType: "SINGLE_PAGE",
          snapshot,
          createdAt: new Date().toISOString(),
        }
        set({ currentVersion: fallback })
      },

      restoreVersion: async (id) => {
        const { currentProject, versions } = get()
        if (!currentProject) return
        await projectsApi.restoreVersion(currentProject.slug, id)
        const target = versions.find((v) => v.id === id)
        if (target) set({ currentVersion: target })
      },
    }),
    {
      name: "uf-project",
      partialize: (state) => ({
        currentProject: state.currentProject,
        currentVersion: state.currentVersion,
      }),
    }
  )
)
