import { api } from "../axios"

// The public lookup returns only VERIFIED findings, and only their slug and title.
export type PublicFindingRef = {
  id: string
  slug: string
  title: string
}

export const findingsApi = {
  get: async (id: string) => {
    const { data } = await api.get<{ success: true; data: PublicFindingRef }>(`/findings/${id}`)
    return data.data
  },
}
