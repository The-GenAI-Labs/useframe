import { api } from "../axios"

export type ReplicateResponse = {
  replicationId: string
  slug: string
  status: "QUEUED"
  tier: "free" | "paid"
}

export type ReplicationStatus =
  | "QUEUED"
  | "RENDERING"
  | "EXTRACTING"
  | "ANALYZING"
  | "GENERATING"
  | "READY"
  | "FAILED"

export type ReplicationListItem = {
  id: string
  slug: string
  sourceUrl: string
  status: ReplicationStatus
  tier: "FREE" | "PAID"
  createdAt: string
}

export type ReplicationNextFile = { path: string; content: string }

export type ReplicationDetail = ReplicationListItem & {
  buildSpec: string | null
  nextFiles: ReplicationNextFile[] | null
  freeCorrectionUsed: boolean
  failureReason: string | null
}

export const replicateApi = {
  create: async (url: string): Promise<ReplicateResponse> => {
    const { data } = await api.post<{ success: true; data: ReplicateResponse }>(
      "/replicate",
      { url }
    )
    return data.data
  },

  list: async (): Promise<ReplicationListItem[]> => {
    const { data } = await api.get<{ success: true; data: ReplicationListItem[] }>("/replicate")
    return data.data
  },

  getBySlug: async (slug: string): Promise<ReplicationDetail> => {
    const { data } = await api.get<{ success: true; data: ReplicationDetail }>(`/replicate/${slug}`)
    return data.data
  },

  sendMessage: async (slug: string, content: string): Promise<void> => {
    await api.post(`/replicate/${slug}/messages`, { content })
  },
}
