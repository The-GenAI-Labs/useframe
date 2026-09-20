import { api } from "../axios"

export type KeywordValidation = {
  pageSlug: string
  declaredKeywords: string[]
  missingKeywords: string[]
  pass: boolean
}

export type SeoStepResult = {
  spec: unknown
  robotsTxt: string
  sitemapXml: string
  keywordValidation: KeywordValidation[]
}

export const seoStepApi = {
  generate: async (slug: string) => {
    const { data } = await api.post<{ success: true; data: SeoStepResult }>(
      `/projects/${slug}/seo-step/generate`
    )
    return data.data
  },

  approve: async (slug: string) => {
    const { data } = await api.post<{ success: true; data: unknown }>(
      `/projects/${slug}/seo-step/approve`
    )
    return data.data
  },

  reject: async (slug: string, feedback: string) => {
    const { data } = await api.post<{ success: true; data: unknown }>(
      `/projects/${slug}/seo-step/reject`,
      { feedback }
    )
    return data.data
  },
}
