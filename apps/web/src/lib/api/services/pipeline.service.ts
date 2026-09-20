import { api } from "../axios"

export type PipelineStepId = "RESEARCH" | "WEBSITE" | "SEO" | "DEPLOY"
export type PipelineStepStatus =
  | "LOCKED"
  | "PENDING"
  | "RUNNING"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
export type PipelineMode = "AUTO" | "MANUAL"

export type PipelineState = {
  id: string
  projectId: string
  mode: PipelineMode
  currentStep: PipelineStepId
  researchStatus: PipelineStepStatus
  websiteStatus: PipelineStepStatus
  seoStatus: PipelineStepStatus
  deployStatus: PipelineStepStatus
  feedbackHistory: { step: PipelineStepId; feedback: string; createdAt: string }[]
  createdAt: string
  updatedAt: string
}

export const pipelineApi = {
  get: async (slug: string) => {
    const { data } = await api.get<{ success: true; data: { pipelineState: PipelineState | null } }>(
      `/projects/${slug}/pipeline`
    )
    return data.data
  },

  setMode: async (slug: string, mode: PipelineMode) => {
    const { data } = await api.patch<{ success: true; data: { pipelineState: PipelineState } }>(
      `/projects/${slug}/pipeline/mode`,
      { mode }
    )
    return data.data
  },
}
