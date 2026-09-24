import { api } from "../axios"

export type ReplicateResponse = {
  projectId: string
  slug: string
  status: "QUEUED"
  tier: "free" | "paid"
}

export const replicateApi = {
  create: async (url: string): Promise<ReplicateResponse> => {
    const { data } = await api.post<{ success: true; data: ReplicateResponse }>(
      "/replicate",
      { url }
    )
    return data.data
  },
}
