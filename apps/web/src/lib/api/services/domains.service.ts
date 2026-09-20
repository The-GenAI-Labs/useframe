import { api } from "../axios"

export type DomainStatus = "PENDING" | "VERIFYING" | "ACTIVE" | "FAILED"

export type CustomDomain = {
  id: string
  domain: string
  status: DomainStatus
  cnameTarget: string | null
  sslStatus: string | null
  failureReason: string | null
}

export const domainsApi = {
  get: async (slug: string) => {
    const { data } = await api.get<{ success: true; data: { customDomain: CustomDomain | null } }>(
      `/projects/${slug}/domains`
    )
    return data.data
  },

  add: async (slug: string, domain: string) => {
    const { data } = await api.post<{ success: true; data: { customDomain: CustomDomain } }>(
      `/projects/${slug}/domains`,
      { domain }
    )
    return data.data
  },
}
