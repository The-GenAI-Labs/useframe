import { api } from "../axios"
import type { CreateProjectInput } from "@repo/schemas"

export type CreateProjectResponse = {
  project: {
    id: string
    slug: string
    name: string
    status: string
    inputType: string
  }
  version: { id: string; versionNumber: number }
  scanQueued: boolean
  tier: "free" | "paid"
}

export type ProjectListItem = {
  id: string
  slug: string
  name: string
  status: string
  pinned: boolean
  niche: string
  inputType: string
  currentVersionId: string | null
  startupIdea: string
  targetAudience: string
  sourceUrl?: string | null
  createdAt: string
  updatedAt: string
}

export type ProjectDetail = ProjectListItem & {
  versions: {
    id: string
    versionNumber: number
    label: string | null
    siteType: string
    snapshot: Record<string, unknown>
    createdAt: string
  }[]
  competitorScans: {
    id: string
    status: string
    designTokens: Record<string, unknown> | null
    extractedContent: Record<string, unknown> | null
  }[]
}

export const projectsApi = {
  create: async (input: CreateProjectInput): Promise<CreateProjectResponse> => {
    const { data } = await api.post<{ success: true; data: CreateProjectResponse }>(
      "/projects",
      input
    )
    return data.data
  },

  list: async (pinned?: boolean): Promise<ProjectListItem[]> => {
    const params = pinned !== undefined ? { pinned: String(pinned) } : {}
    const { data } = await api.get<{ success: true; data: ProjectListItem[] }>(
      "/projects",
      { params }
    )
    return data.data
  },

  getBySlug: async (slug: string): Promise<ProjectDetail> => {
    const { data } = await api.get<{ success: true; data: ProjectDetail }>(
      `/projects/${slug}`
    )
    return data.data
  },

  update: async (
    slug: string,
    input: { name?: string; pinned?: boolean; status?: string }
  ): Promise<ProjectListItem> => {
    const { data } = await api.patch<{ success: true; data: ProjectListItem }>(
      `/projects/${slug}`,
      input
    )
    return data.data
  },

  listVersions: async (slug: string) => {
    const { data } = await api.get<{
      success: true
      data: {
        id: string
        versionNumber: number
        label: string | null
        siteType: string
        snapshot: Record<string, unknown>
        createdAt: string
      }[]
    }>(`/projects/${slug}/versions`)
    return data.data
  },

  createVersion: async (slug: string) => {
    const { data } = await api.post<{
      success: true
      data: { version: { id: string; versionNumber: number } }
    }>(`/projects/${slug}/versions`)
    return data.data
  },

  getVersion: async (slug: string, versionId: string) => {
    const { data } = await api.get<{ success: true; data: Record<string, unknown> }>(
      `/projects/${slug}/versions/${versionId}`
    )
    return data.data
  },

  sendMessage: async (
    slug: string,
    input: { conversationId?: string; content: string; versionId: string }
  ) => {
    const { data } = await api.post<{
      success: true
      data: {
        message: {
          id: string
          role: string
          content: string
          producedVersionId: string | null
        }
        newVersion: { id: string; versionNumber: number } | null
        changed: boolean
        conversationId: string
      }
    }>(`/projects/${slug}/messages`, input)
    return data.data
  },

  getVersionSnapshot: async (slug: string, versionId: string) => {
    const { data } = await api.get<{
      success: true
      data: { snapshot: Record<string, unknown> }
    }>(`/projects/${slug}/versions/${versionId}/snapshot`)
    return data.data
  },

  restoreVersion: async (slug: string, versionId: string) => {
    const { data } = await api.post<{
      success: true
      data: { currentVersionId: string }
    }>(`/projects/${slug}/versions/${versionId}/restore`)
    return data.data
  },
}
