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

export type PlanCandidates = {
  candidateA: { brief: DesignBrief; previewUrl: string }
  candidateB: { brief: DesignBrief; previewUrl: string }
  recommended: "A" | "B"
  recommendedReason: string
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
      data: { brief: DesignBrief; candidates?: PlanCandidates }
    }>(`/projects/${slug}/research/generate`, { feedback })
    return data.data
  },

  approve: async (slug: string) => {
    const { data } = await api.post<{ success: true; data: unknown }>(
      `/projects/${slug}/research/approve`
    )
    return data.data
  },

  // Two-candidate picker's replacement for approve(). Both candidates are
  // sent back from the client (it already has them from candidates_ready),
  // so the server needs no re-fetch. choice "auto" defers to `recommended`.
  select: async (
    slug: string,
    body: {
      choice: "A" | "B" | "auto"
      candidateA: DesignBrief
      candidateB: DesignBrief
      recommended: "A" | "B"
    }
  ) => {
    const { data } = await api.post<{
      success: true
      data: { brief: DesignBrief }
    }>(`/projects/${slug}/research/select`, body)
    return data.data
  },

  reject: async (slug: string, feedback: string) => {
    const { data } = await api.post<{ success: true; data: unknown }>(
      `/projects/${slug}/research/reject`,
      { feedback }
    )
    return data.data
  },

  // Queues PDF generation on the worker; the finished reports arrive as an
  // assistant message with attachments rather than in this response.
  requestPdf: async (
    slug: string,
    sections: ("COMPETITOR_ANALYSIS" | "RESEARCH_RATIONALE")[],
    conversationId?: string
  ) => {
    const { data } = await api.post<{
      success: true
      data: { queued: boolean; conversationId: string }
    }>(`/projects/${slug}/research/pdf`, { sections, conversationId })
    return data.data
  },

  getFinding: async (slug: string, findingId: string) => {
    const { data } = await api.get<{ success: true; data: ResearchFinding }>(
      `/projects/${slug}/research/finding/${findingId}`
    )
    return data.data
  },
}
