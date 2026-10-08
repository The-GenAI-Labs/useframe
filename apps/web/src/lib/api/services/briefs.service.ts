import { api } from "../axios"
import type {
  ApproveBriefInput,
  BriefDraftSummary,
  BriefUploadField,
  BriefView,
  CreateBriefInput,
  PatchBriefInput,
  PrefillBriefInput,
} from "@repo/schemas"
import type { CreateProjectResponse } from "./projects.service"

export type BriefApiError = Error & {
  code?: string
  status?: number
  errors?: Record<string, string[]>
  data?: unknown
  retryAfter?: number
}

type Envelope<T> = { success: true; data: T }

async function upload(path: string, file: File, field: BriefUploadField): Promise<BriefView> {
  const { data } = await api.post<Envelope<{ brief: BriefView }>>(path, file, {
    params: { field, name: file.name },
    headers: { "Content-Type": file.type || "application/octet-stream" },
    transformRequest: [(body: unknown) => body],
  })
  return data.data.brief
}

export const briefsApi = {
  create: async (input: CreateBriefInput): Promise<{ brief: BriefView; prefillSuggested: boolean }> => {
    const { data } = await api.post<Envelope<{ brief: BriefView; prefillSuggested: boolean }>>("/briefs", input)
    return data.data
  },

  listOpen: async (): Promise<BriefDraftSummary[]> => {
    const { data } = await api.get<Envelope<{ drafts: BriefDraftSummary[] }>>("/briefs", { params: { open: "true" } })
    return data.data.drafts
  },

  get: async (id: string): Promise<BriefView> => {
    const { data } = await api.get<Envelope<{ brief: BriefView }>>(`/briefs/${id}`)
    return data.data.brief
  },

  patch: async (id: string, input: PatchBriefInput): Promise<BriefView> => {
    const { data } = await api.patch<Envelope<{ brief: BriefView }>>(`/briefs/${id}`, input)
    return data.data.brief
  },

  remove: async (id: string): Promise<void> => {
    await api.delete(`/briefs/${id}`)
  },

  prefill: async (id: string, input: PrefillBriefInput, signal: AbortSignal): Promise<{ brief: BriefView; filled: string[] }> => {
    const { data } = await api.post<Envelope<{ brief: BriefView; filled: string[] }>>(`/briefs/${id}/prefill`, input, {
      signal,
      timeout: 40_000,
    })
    return data.data
  },

  upload: (id: string, file: File, field: BriefUploadField): Promise<BriefView> => upload(`/briefs/${id}/uploads`, file, field),

  createProject: async (briefId: string): Promise<CreateProjectResponse & { briefId: string }> => {
    const { data } = await api.post<Envelope<CreateProjectResponse & { briefId: string }>>("/projects", { briefId })
    return data.data
  },

  getForProject: async (slug: string): Promise<BriefView> => {
    const { data } = await api.get<Envelope<{ brief: BriefView }>>(`/projects/${slug}/brief`)
    return data.data.brief
  },

  patchForProject: async (slug: string, input: PatchBriefInput): Promise<{ brief: BriefView; regenerateNeeded: boolean }> => {
    const { data } = await api.patch<Envelope<{ brief: BriefView; regenerateNeeded: boolean }>>(`/projects/${slug}/brief`, input)
    return data.data
  },

  approveForProject: async (slug: string, input: ApproveBriefInput): Promise<BriefView> => {
    const { data } = await api.post<Envelope<{ brief: BriefView }>>(`/projects/${slug}/brief/approve`, input)
    return data.data.brief
  },

  uploadForProject: (slug: string, file: File, field: BriefUploadField): Promise<BriefView> =>
    upload(`/projects/${slug}/brief/uploads`, file, field),

  eligibility: async (): Promise<{ eligible: boolean }> => {
    const { data } = await api.get<Envelope<{ eligible: boolean }>>("/generate/eligibility")
    return data.data
  },
}

const API_ORIGIN = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? "http://localhost:4000"

// Upload URLs come back as signed API paths.
export function briefAssetUrl(path: string): string {
  return `${API_ORIGIN}${path}`
}
