import { api } from "../axios"

export type DesignBrief = {
  product: string
  audience: { primary: string; secondary?: string }
  goal: string
  brand: { personality: string; positioning: string; tone: string }
  colors: {
    primary: string
    secondary: string
    accent: string
    rationale: string
    citation: string
  }
  typography: {
    primary: string
    secondary: string
    minSize: string
    rationale: string
    citation: string
  }
  layout: { sections: string[]; rationale: string; citation: string }
  copyFramework: "AIDA" | "PAS" | "FAB" | "PASTOR"
  frameworkRationale: string
  density: string
  motion: string
  accessibility: { minContrast: string; touchTarget: string }
  avoid: string[]
  citations: {
    id: string
    articleId?: string
    title: string
    source: string
    url?: string
    relevance?: string
    appliedTo?: string
  }[]
}

export type ResearchFinding = {
  id: string
  claim: string
  paper: string
  field: string
  decision: string
  options: { value: string; label: string; fits: string[] }[]
  contextHeader: string
  verified: boolean
}

export const researchApi = {
  get: async (slug: string) => {
    const { data } = await api.get<{
      success: true
      data: { brief: DesignBrief | null }
    }>(`/projects/${slug}/research`)
    return data.data
  },

  update: async (slug: string, brief: DesignBrief) => {
    const { data } = await api.put<{
      success: true
      data: { brief: DesignBrief }
    }>(`/projects/${slug}/research`, { brief })
    return data.data
  },

  generate: async (slug: string, feedback?: string) => {
    const { data } = await api.post<{
      success: true
      data: { brief: DesignBrief }
    }>(`/projects/${slug}/research/generate`, { feedback })
    return data.data
  },

  approve: async (slug: string) => {
    const { data } = await api.post<{ success: true; data: unknown }>(
      `/projects/${slug}/research/approve`
    )
    return data.data
  },

  reject: async (slug: string, feedback: string) => {
    const { data } = await api.post<{ success: true; data: unknown }>(
      `/projects/${slug}/research/reject`,
      { feedback }
    )
    return data.data
  },

  getFinding: async (slug: string, findingId: string) => {
    const { data } = await api.get<{ success: true; data: ResearchFinding }>(
      `/projects/${slug}/research/finding/${findingId}`
    )
    return data.data
  },
}
