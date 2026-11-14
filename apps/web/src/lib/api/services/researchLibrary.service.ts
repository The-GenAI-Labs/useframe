import type {
  FindingDetail,
  LibraryAccess,
  LibraryCategoryCount,
  LibraryListResponse,
  ResearchCategory,
} from "@repo/schemas"
import { api } from "../axios"

export type LibraryListParams = {
  category?: ResearchCategory
  q?: string
  tag?: string
  cursor?: string
}

export const apiErrorStatus = (err: unknown): number | null =>
  err instanceof Error ? ((err as Error & { status?: number }).status ?? null) : null

export const isResearchLocked = (err: unknown) =>
  err instanceof Error && (err as Error & { code?: string }).code === "RESEARCH_LOCKED"

export const researchLibraryApi = {
  access: async () => {
    const { data } = await api.get<{ success: true; data: LibraryAccess }>("/research/library/access")
    return data.data
  },

  categories: async () => {
    const { data } = await api.get<{ success: true; data: LibraryCategoryCount[] }>("/research/library/categories")
    return data.data
  },

  list: async (params: LibraryListParams) => {
    const { data } = await api.get<{ success: true; data: LibraryListResponse }>("/research/library/findings", {
      params: Object.fromEntries(Object.entries(params).filter(([, v]) => v)),
    })
    return data.data
  },

  detail: async (slug: string) => {
    const { data } = await api.get<{ success: true; data: FindingDetail }>(
      `/research/library/findings/${encodeURIComponent(slug)}`,
    )
    return data.data
  },
}
