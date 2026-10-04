import { api } from "../axios"

export type DomainStatus =
  | "AWAITING_OWNERSHIP_TXT"
  | "CONFIGURING_EDGE"
  | "AWAITING_ROUTING_DNS"
  | "ACTIVE"
  | "FAILED"
  | "REMOVING"

export type DnsRecord = { type: "TXT" | "CNAME"; name: string; relativeName: string; value: string }

export type DomainSteps = [
  { id: "ownership"; state: "pending" | "found" | "wrong_value" | "done"; record: DnsRecord },
  { id: "routing"; state: "waiting" | "pending" | "found" | "done"; record: DnsRecord },
]

export type CustomDomain = {
  id: string
  hostname: string
  registrableDomain: string
  isApex: boolean
  status: DomainStatus
  steps: DomainSteps
  currentDns: { resolvesTo: string[]; txtFound: string[] }
  certificate: { status: string | null; hint: string | null }
  failureReason: string | null
  retryable: boolean
  warning: string | null
  lastCheckedAt: string | null
  apexAdvice: string | null
  notes: string[]
}

type Envelope<T> = { success: true; data: T }

export const domainsApi = {
  get: async (slug: string) => {
    const { data } = await api.get<Envelope<{ enabled: boolean; domain: CustomDomain | null }>>(
      `/projects/${slug}/domains`
    )
    return data.data
  },

  add: async (slug: string, hostname: string) => {
    const { data } = await api.post<Envelope<CustomDomain>>(`/projects/${slug}/domains`, { hostname })
    return data.data
  },

  check: async (slug: string, domainId: string) => {
    const { data } = await api.post<Envelope<CustomDomain>>(`/projects/${slug}/domains/${domainId}/check`)
    return data.data
  },

  retry: async (slug: string, domainId: string) => {
    const { data } = await api.post<Envelope<CustomDomain>>(`/projects/${slug}/domains/${domainId}/retry`)
    return data.data
  },

  remove: async (slug: string, domainId: string) => {
    const { data } = await api.delete<Envelope<{ id: string; status: "REMOVING" }>>(
      `/projects/${slug}/domains/${domainId}`
    )
    return data.data
  },
}
