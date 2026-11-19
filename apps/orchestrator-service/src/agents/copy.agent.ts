import type { LanguageModelV1 } from "ai"
import type { Response } from "express"
import { z } from "zod"
import { sseWrite } from "@/llm/stream.js"
import { checkCta, WRITTEN_SECTION_TYPES, type GenerateRequest, type QualityIssue, type Section, type SiteSpec } from "@repo/schemas"
import { DEFAULT_COPY_PROMPT, type CopyPromptVars } from "@/prompts/copy.prompt.js"
import type { getProviderOptionsForTier } from "@/llm/router.js"
import { generateValidated } from "@/llm/structured.js"
import { briefFactsBlock, deterministicContent, type ProjectBriefContext } from "@/lib/briefPipeline.js"
import {
  contractText,
  copyFacts,
  fallbackContent,
  fallbackSource,
  headerContent,
  repairContent,
  severeIssues,
  validatePageCopy,
} from "@/lib/copyQuality.js"

const CopyItem = z.object({ title: z.string(), description: z.string(), icon: z.string().optional() })

export const SectionCopySchema = z.object({
  eyebrow: z.string().optional(),
  headline: z.string(),
  subheadline: z.string().optional(),
  body: z.string().optional(),
  cta: z.object({ primary: z.string().optional(), secondary: z.string().optional() }).optional(),
  items: z.array(CopyItem).optional(),
})

export const PageCopySchema = z.object({
  primaryCta: z.string(),
  sections: z.array(SectionCopySchema.extend({ index: z.number().int() })),
})

type Content = NonNullable<Section["content"]>

export async function runCopyAgent(
  res: Response,
  spec: Partial<SiteSpec>,
  request: GenerateRequest,
  model: LanguageModelV1,
  providerOptions?: ReturnType<typeof getProviderOptionsForTier>,
  promptFn: (vars: CopyPromptVars) => string = DEFAULT_COPY_PROMPT,
  briefCtx: ProjectBriefContext | null = null,
  mediaContextFor?: (pageSlug: string, section: Section) => string | undefined,
): Promise<Partial<SiteSpec>> {
  if (!spec.pages) return spec
  const facts = copyFacts(request, briefCtx)
  const source = fallbackSource(request, briefCtx)
  const briefCtaLabel = briefCtx?.data.ctaPrimary?.label
  const updatedPages: SiteSpec["pages"] = []

  for (const page of spec.pages) {
    const fixed = new Map<number, Content>()
    const written: Section[] = []
    for (const section of page.sections) {
      const det = briefCtx ? deterministicContent(section.type, briefCtx) : null
      if (section.type === "HEADER") fixed.set(section.index, headerContent(source))
      else if (section.type === "FOOTER") fixed.set(section.index, {})
      else if (det) fixed.set(section.index, det)
      else if (WRITTEN_SECTION_TYPES.includes(section.type)) written.push(section)
      else fixed.set(section.index, {})
    }

    const copied = new Map<number, Content>()
    let primaryCta = briefCtaLabel ?? source.ctaLabel
    if (written.length > 0) {
      const { object, issues } = await generateValidated({
        model,
        schema: PageCopySchema,
        prompt: promptFn({
          copyFramework: spec.copyFramework ?? "AIDA",
          frameworkRationale: spec.designBrief?.frameworkRationale,
          startupIdea: request.startupIdea,
          productName: source.product || undefined,
          niche: request.niche,
          targetAudience: request.targetAudience,
          brandTone: spec.designBrief?.brand.tone,
          pageTitle: page.title,
          pageType: page.type,
          ctaLabel: briefCtaLabel,
          briefFacts: briefCtx ? briefFactsBlock(briefCtx) : undefined,
          sections: written.map((s) => ({
            index: s.index,
            type: s.type,
            variant: s.variant,
            purpose: s.purpose,
            contract: contractText(s.type, s.variant),
            mediaContext: mediaContextFor?.(page.slug, s),
          })),
        }),
        providerOptions,
        maxTokens: 8000,
        functionId: "copy-agent",
        validate: (copy) => validatePageCopy(copy, written, facts),
        onDelta: (delta) => sseWrite(res, { type: "token", delta }),
      })
      if (issues.length > 0) console.warn(`[copy] ${page.slug}: ${issues.length} issues left after retry; repairing`)
      const ctaCheck: QualityIssue[] = []
      checkCta(ctaCheck, "primaryCta", object?.primaryCta, true)
      if (!briefCtaLabel && object && ctaCheck.length === 0) primaryCta = object.primaryCta.trim()
      for (const s of object?.sections ?? []) {
        const { index, ...content } = s
        copied.set(index, content)
      }
      for (const section of written) {
        const raw = copied.get(section.index)
        const withCta = raw && (section.type === "HERO" || section.type === "CTA") ? { ...raw, cta: { ...raw.cta, primary: primaryCta } } : raw
        copied.set(section.index, withCta ? repairContent(section.type, section.variant, withCta) : {})
      }
    }

    const sections: Section[] = []
    for (const section of page.sections) {
      let next: Section = { ...section, content: fixed.get(section.index) ?? copied.get(section.index) ?? {} }
      if (written.includes(section) && severeIssues(section.type, section.variant, next.content!, facts).length > 0) {
        const fallback = fallbackContent(section.type, section.variant, { ...source, ctaLabel: primaryCta })
        if (!fallback) {
          console.warn(`[copy] dropped ${section.type} on ${page.slug}: no acceptable copy and no brief facts`)
          continue
        }
        next = { ...section, content: fallback.content, ...(fallback.variant ? { variant: fallback.variant } : {}) }
      }
      sections.push(next)
      sseWrite(res, { type: "section_complete", pageSlug: page.slug, sectionType: section.type, sectionIndex: section.index })
    }
    updatedPages.push({ ...page, sections })
  }

  return { ...spec, pages: updatedPages }
}
