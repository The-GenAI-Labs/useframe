import { api } from "../axios"

export type PublicFinding = {
  id: string
  claim: string
  paper: string
  field: string
  decision: string
  options: { value: string; label: string; fits: string[] }[]
  contextHeader: string
  verified: boolean
}

export const findingsApi = {
  get: async (id: string) => {
    const { data } = await api.get<{ success: true; data: PublicFinding }>(`/findings/${id}`)
    return data.data
  },
}
