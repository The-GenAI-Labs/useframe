import { api } from "../axios"

export const websiteApi = {
  approve: async (slug: string) => {
    const { data } = await api.post<{ success: true; data: unknown }>(
      `/projects/${slug}/website/approve`
    )
    return data.data
  },

  reject: async (slug: string, feedback: string) => {
    const { data } = await api.post<{
      success: true
      data: { version: { id: string; versionNumber: number }; summary: string }
    }>(`/projects/${slug}/website/reject`, { feedback })
    return data.data
  },
}
