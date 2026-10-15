import { api } from "../axios"

export type MediaBudgetTier = "IMAGES_ONLY" | "LIGHT" | "STANDARD" | "RICH"
export type MediaJobStatus = "QUEUED" | "RUNNING" | "AWAITING_USER" | "DONE" | "FAILED" | "CANCELLED"
export type MediaCheckpoint = "PLAN_APPROVE" | "CONCEPT_PICK" | "IMAGES_APPROVE" | "VIDEO_APPROVE"

export type MediaJobConcept = {
  id: string
  title: string
  logline: string
  whyItFits: string
  mechanism: string
  beats: { atSec: number; change: string }[]
  score: number | null
}

export type MediaJobItem = {
  itemId: string
  slotId: string
  kind: "image" | "video"
  decision: "GENERATE" | "USE_UPLOADED"
  role: string
  intent: string
  reason: string
  aspect: string
  durationSec: number | null
  status: string
  failureReason: string | null
  credits: number
  concepts: MediaJobConcept[]
  recommendedId: string | null
  chosenId: string | null
  conceptRegenerationsLeft: number
  frames: { opening: string | null; ending: string | null } | null
  image: string | null
  candidates: { id: string; video: string | null; poster: string | null; notes: string | null }[]
  chosenCandidateId: string | null
  usesStill: boolean
}

export type MediaJob = {
  id: string
  mode: "AUTO" | "MANUAL"
  status: MediaJobStatus
  stage: string | null
  stageLabel: string | null
  checkpoint: MediaCheckpoint | null
  checkpointExpiresAt: string | null
  failureReason: string | null
  creditsReserved: number
  creditsRefunded: number
  resultVersionId: string | null
  createdAt: string
  finishedAt: string | null
  dropped: { itemId: string; reason: string }[]
  items: MediaJobItem[]
}

export type MediaJobOverview = {
  job: MediaJob | null
  notice: string | null
  narrative: { storyArc: string; [key: string]: unknown } | null
  script: { itemId: string; slotId: string; kind: "image" | "video"; role: string; reason: string; intent: string }[]
}

export type MediaEstimate = {
  credits: number
  items: { kind: "image" | "video" | "blueprint"; count: number; credits: number }[]
  balance: number
  budgetTier: MediaBudgetTier
  maximum: boolean
}

export type CheckpointAction = {
  checkpoint: MediaCheckpoint
  action: "pick" | "approve" | "regenerate" | "skip" | "drop"
  itemId?: string
  conceptId?: string
  candidateId?: string
  candidates?: number
  note?: string
}

export type StartMediaJobInput = {
  mode: "AUTO" | "MANUAL"
  scope: { kind: "site" } | { kind: "slots"; slotIds: string[] }
}

type Envelope<T> = { success: true; data: T }

export const ACTIVE_MEDIA_JOB: MediaJobStatus[] = ["QUEUED", "RUNNING", "AWAITING_USER"]

export const mediaJobsApi = {
  accountEstimate: async (budget: MediaBudgetTier) => {
    const { data } = await api.get<Envelope<{ credits: number; maximum: true }>>("/media/estimate", { params: { budget } })
    return data.data
  },

  estimate: async (slug: string) => {
    const { data } = await api.get<Envelope<MediaEstimate>>(`/projects/${slug}/media/estimate`)
    return data.data
  },

  latest: async (slug: string) => {
    const { data } = await api.get<Envelope<MediaJobOverview>>(`/projects/${slug}/media/jobs/latest`)
    return data.data
  },

  start: async (slug: string, input: StartMediaJobInput) => {
    const { data } = await api.post<Envelope<MediaJob>>(`/projects/${slug}/media/jobs`, input)
    return data.data
  },

  checkpoint: async (slug: string, jobId: string, action: CheckpointAction) => {
    const { data } = await api.post<Envelope<MediaJob>>(`/projects/${slug}/media/jobs/${jobId}/checkpoint`, action)
    return data.data
  },

  cancel: async (slug: string, jobId: string) => {
    const { data } = await api.post<Envelope<MediaJob>>(`/projects/${slug}/media/jobs/${jobId}/cancel`)
    return data.data
  },
}
