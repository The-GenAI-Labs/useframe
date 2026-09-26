import type { LanguageModelV1 } from "ai"
import type { SeoMaterializeRequest, SeoMaterializeResponse, SiteSpec } from "@repo/schemas"
import { runSeoAgent } from "./seo.agent.js"
import { buildRobotsTxt, buildSitemapXml, validateKeywords } from "@/spec/seoFiles.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"

function hasSeo(page: SiteSpec["pages"][number]): boolean {
  return !!page.seo?.title && !!page.seo?.description
}

export async function runSeoMaterializeAgent(
  request: SeoMaterializeRequest,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
): Promise<SeoMaterializeResponse> {
  const spec = structuredClone(request.spec) as SiteSpec

  const pagesNeedingSeo = spec.pages.filter((p) => !hasSeo(p))

  let finalSpec = spec
  if (pagesNeedingSeo.length > 0) {
    const partial = await runSeoAgent(
      { ...spec, pages: pagesNeedingSeo },
      {
        startupIdea: request.startupIdea,
        niche: request.niche,
        targetAudience: "",
        inputType: "FROM_SCRATCH",
        tier: "paid",
      },
      model,
      providerOptions,
    )

    const bySlug = new Map((partial.pages ?? []).map((p) => [p.slug, p]))
    finalSpec = {
      ...spec,
      pages: spec.pages.map((p) => bySlug.get(p.slug) ?? p),
    }
  }

  const robotsTxt = buildRobotsTxt(request.baseUrl)
  const sitemapXml = buildSitemapXml(finalSpec.pages, request.baseUrl)
  const keywordValidation = validateKeywords(finalSpec)

  return { spec: finalSpec, robotsTxt, sitemapXml, keywordValidation }
}
