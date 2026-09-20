import { api } from "../axios"

export type SeoAuditStatus = "PENDING" | "CRAWLING" | "AUDITING" | "DONE" | "FAILED"
export type SeoTier = "free" | "paid"

export type CrawledPage = {
  url: string
  title: string
  metaDescription: string | null
  h1s: string[]
  wordCount: number
  statusCode: number
}

export type KeywordDensityEntry = {
  keyword: string
  count: number
  density: number
}

export type SeoFix = {
  priority: "high" | "medium" | "low"
  title: string
  detail: string
}

export type SeoLlmSummary = {
  explanation: string
  fixes: SeoFix[]
}

export type GetSeoAuditResponse = {
  id: string
  url: string
  domain: string | null
  tier: SeoTier
  status: SeoAuditStatus
  performanceScore: number | null
  accessibilityScore: number | null
  seoScore: number | null
  bestPracticesScore: number | null
  pagesCrawled: number | null
  crawlResults: { pages: CrawledPage[] } | null
  keywords: { topKeywords: KeywordDensityEntry[] } | null
  auditJson: unknown | null
  computedScore: number | null
  llmSummary: SeoLlmSummary | null
  failureReason: string | null
}

export const seoApi = {
  create: async (url: string, tier: SeoTier = "free") => {
    const { data } = await api.post<{
      success: true
      data: { seoAuditId: string; cached: boolean }
    }>("/seo/audit", { url, tier })
    return data.data
  },

  get: async (id: string) => {
    const { data } = await api.get<{ success: true; data: GetSeoAuditResponse }>(
      `/seo/audit/${id}`
    )
    return data.data
  },
}
