import { Router, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { PlanSSERequestSchema, buildHeroPreviewDataUrl } from "@repo/schemas"
import { verifyToken } from "@/lib/auth.js"
import { initSSE, sseWrite, sseError } from "@/llm/stream.js"
import { getModelForTier } from "@/llm/router.js"
import { runPlannerCandidatesAgent } from "@/agents/planner.agent.js"
import { runResearchAgent } from "@/agents/research.agent.js"
import { callRetrieve, callDomainPattern, callAudienceModifier } from "@/lib/researchService.js"
import { findCompetitorUrls, enqueueCompetitorScans, waitForScans } from "@/tools/competitorSearch.js"
import type { PlannerExtracted } from "@/prompts/planner.prompt.js"
import { prisma, type Prisma } from "@useframe/db"

const router: Router = Router()

// NicheCategory enum values (SCREAMING_SNAKE) -> DomainPattern/ResearchFinding.appliesTo keys (snake_case)
const NICHE_TO_DOMAIN: Record<string, string> = {
  EDTECH: "education",
  HEALTH_WELLNESS: "health_wellness",
  FINTECH: "fintech",
  SAAS_B2B: "saas_b2b",
  ECOMMERCE: "ecommerce",
  FOOD_LIFESTYLE: "food_lifestyle",
  FITNESS: "fitness",
  LUXURY: "luxury",
  MEDITATION: "health_wellness",
  KIDS: "education",
  OTHER: "other",
}

// A generic, plain-language target audience string is mapped to the closest
// AudienceModifier bucket. Falls back to "general" when nothing matches —
// the planner still works fine without a modifier, just without its extra
// density/motion/contrast guidance.
function inferAudienceKey(targetAudience: string): string {
  const t = targetAudience.toLowerCase()
  if (t.includes("child") || t.includes("kid")) return "children_under_10"
  if (t.includes("teen")) return "teens"
  if (t.includes("senior") || t.includes("elder")) return "seniors"
  if (t.includes("parent")) return "parents"
  if (t.includes("b2b") || t.includes("business") || t.includes("enterprise")) return "b2b_buyers"
  if (t.includes("developer") || t.includes("engineer")) return "developers"
  if (t.includes("adult")) return "adults"
  return "general"
}

const DECISION_QUERIES = (domain: string, audience: string) => [
  { decision: "primary_color", query: `color psychology trust ${domain} ${audience}` },
  { decision: "typography", query: `typography readability ${audience}` },
  { decision: "conversion_structure", query: `purchase decision trust signals ${domain}` },
  { decision: "layout", query: `landing page section order ${domain}` },
  { decision: "accessibility", query: `accessibility contrast ${audience}` },
  { decision: "motion", query: `motion animation attention ${audience}` },
]

router.post("/plan", (req: Request, res: Response): void => {
  let user: { id: string; email: string; plan: string }
  try {
    user = verifyToken(req)
  } catch (err) {
    console.error("[plan] auth failed:", err instanceof Error ? err.message : err)
    res.status(401).json({ success: false, message: "Unauthorized" })
    return
  }

  const parsed = PlanSSERequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const { projectId, versionId, tier, ideaText, niche, targetAudience, sourceUrl, extracted } = parsed.data

  initSSE(res)

  void (async () => {
    try {
      const domain = NICHE_TO_DOMAIN[niche] ?? "other"
      const audience = inferAudienceKey(targetAudience)
      const model = getModelForTier(tier)

      sseWrite(res, {
        type: "stage",
        stage: "SCAN",
        message: "Discovering competitors...",
      })

      let competitorUrls: string[] = []
      if (sourceUrl) {
        competitorUrls = [sourceUrl]
      } else {
        competitorUrls = await findCompetitorUrls(domain, ideaText, audience).catch((err) => {
          console.warn("[plan] competitor discovery failed, continuing without it:", err)
          return []
        })
      }

      // Bounds the worst-case Playwright-scan + LLM cost of any single free
      // generation, abuse or not — free tier gets at most 1 competitor scan,
      // paid gets findCompetitorUrls' existing cap of up to 3.
      const maxCompetitors = tier === "free" ? 1 : 3
      competitorUrls = competitorUrls.slice(0, maxCompetitors)

      let scannedCompetitors: { sourceUrl: string; designTokens?: unknown; extractedContent?: unknown }[] = []

      if (competitorUrls.length > 0) {
        const created = await enqueueCompetitorScans(competitorUrls, user.id, projectId)
        const scanIds = created.map((c) => c.scanId)

        const outcomes = await waitForScans(scanIds, {
          timeoutMs: 45_000,
          intervalMs: 2_000,
          onProgress: (done, total) => {
            sseWrite(res, {
              type: "stage",
              stage: "SCAN",
              message: `Analyzing competitor sites... (${done}/${total})`,
            })
          },
        })

        scannedCompetitors = outcomes
          .filter((o) => o.status === "DONE")
          .map((o) => ({
            sourceUrl: o.sourceUrl,
            designTokens: o.designTokens,
            extractedContent: o.extractedContent,
          }))
      }

      sseWrite(res, {
        type: "stage",
        stage: "RESEARCH",
        message: "Retrieving research findings...",
      })

      const [{ results }, domainPattern, audienceModifier] = await Promise.all([
        callRetrieve(DECISION_QUERIES(domain, audience), domain, audience),
        callDomainPattern(domain),
        callAudienceModifier(audience),
      ])

      const plannerExtracted: PlannerExtracted = {
        startupIdea: ideaText,
        domain,
        audience,
        brandPersonality: extracted?.brandPersonality,
        pricePositioning: extracted?.pricePositioning,
        businessModel: extracted?.businessModel,
        differentiator: extracted?.differentiator,
      }

      sseWrite(res, {
        type: "stage",
        stage: "RESEARCH",
        message: "Compiling two design directions...",
      })

      const [candidates, researchReport] = await Promise.all([
        runPlannerCandidatesAgent({ extracted: plannerExtracted, results, domainPattern, audienceModifier }, model),
        runResearchAgent(
          {
            startupIdea: ideaText,
            niche,
            targetAudience,
            scannedCompetitors: scannedCompetitors.length > 0 ? scannedCompetitors : undefined,
          },
          model,
        ),
      ])

      // NOTE: ProjectVersion.designBrief is deliberately NOT written here any
      // more. With two candidates there is no chosen brief yet — it is stored
      // by POST /api/projects/:slug/plan/select once the user picks, so the
      // version never holds a direction the user didn't choose.
      if (researchReport.competitorInsights) {
        await prisma.researchReport
          .upsert({
            where: { projectId },
            create: {
              projectId,
              inputType: "FROM_SCRATCH",
              ...researchReport,
              colorPalette: researchReport.colorPalette as Prisma.InputJsonValue,
              imageDirection: researchReport.imageDirection as Prisma.InputJsonValue,
              seoKeywords: researchReport.seoKeywords as Prisma.InputJsonValue | undefined,
              competitorInsights: researchReport.competitorInsights as Prisma.InputJsonValue,
              citations: researchReport.citations as Prisma.InputJsonValue,
            },
            update: {
              competitorInsights: researchReport.competitorInsights as Prisma.InputJsonValue,
            },
          })
          .catch((err: unknown) => {
            console.error("[plan] failed to persist competitorInsights:", err)
          })
      }

      sseWrite(res, {
        type: "stage",
        stage: "RESEARCH",
        message: "Rendering previews...",
      })

      // Hero previews are inline SVG data URLs built synchronously from each
      // brief's own colours/typography — no browser, no upload, nothing to
      // clean up. See buildHeroPreviewDataUrl in @repo/schemas.
      const previewA = buildHeroPreviewDataUrl(candidates.candidateA)
      const previewB = buildHeroPreviewDataUrl(candidates.candidateB)

      sseWrite(res, {
        type: "candidates_ready",
        candidateA: { brief: candidates.candidateA, previewUrl: previewA },
        candidateB: { brief: candidates.candidateB, previewUrl: previewB },
        recommended: candidates.recommended,
        recommendedReason: candidates.recommendedReason,
        competitorInsights: researchReport.competitorInsights,
      })

      // Stream ends here — it does not auto-proceed to /generate. The user
      // picks a direction via POST /api/projects/:slug/plan/select first.
      sseWrite(res, {
        type: "stage",
        stage: "COMPLETE",
        message: "Two design directions ready.",
      })
    } catch (err) {
      console.error("[plan] failed:", err instanceof Error ? err.message : err)
      sseError(res, err instanceof Error ? err.message : "Plan generation failed")
    } finally {
      res.end()
    }
  })()
})

// Plain JSON variant of the planner-only (no competitor scan, no SSE) logic
// this route used to run at POST /plan before that path was converted to
// SSE above. apps/server's modules/plan/plan.service.ts (the separate,
// untouched DesignBrief-approval workflow) calls this shape via callPlan()
// in apps/server/src/lib/orchestrator.ts and expects a synchronous JSON
// { success, data: { brief } } response — /plan/sync preserves that contract
// exactly so that module keeps working unmodified.
const PlanSyncRequestSchema = z.object({
  projectId: z.string().optional(),
  versionId: z.string().optional(),
  startupIdea: z.string().min(3).max(2000),
  niche: z.string(),
  targetAudience: z.string(),
  brandPersonality: z.string().optional(),
  pricePositioning: z.string().optional(),
  businessModel: z.string().optional(),
  differentiator: z.string().optional(),
})

router.post("/plan/sync", (req: Request, res: Response, next: NextFunction): void => {
  try {
    verifyToken(req)
  } catch (err) {
    console.error("[plan/sync] auth failed:", err instanceof Error ? err.message : err)
    res.status(401).json({ success: false, message: "Unauthorized" })
    return
  }

  const parsed = PlanSyncRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const { startupIdea, niche, targetAudience, brandPersonality, pricePositioning, businessModel, differentiator } =
    parsed.data

  const domain = NICHE_TO_DOMAIN[niche] ?? "other"
  const audience = inferAudienceKey(targetAudience)

  const extracted: PlannerExtracted = {
    startupIdea,
    domain,
    audience,
    brandPersonality,
    pricePositioning,
    businessModel,
    differentiator,
  }

  Promise.all([
    callRetrieve(DECISION_QUERIES(domain, audience), domain, audience),
    callDomainPattern(domain),
    callAudienceModifier(audience),
  ])
    .then(([{ results }, domainPattern, audienceModifier]) => {
      // This sync path is the pre-existing DesignBrief-approval workflow's
      // dependency, not the new tier-gated generation flow, so it keeps its
      // original always-DeepSeek behavior rather than taking a tier param.
      const model = getModelForTier("free")
      return runPlannerCandidatesAgent({ extracted, results, domainPattern, audienceModifier }, model)
    })
    .then((candidates) => {
      // `brief` is still returned (the recommended candidate) so any caller
      // that hasn't moved to the picker keeps working unchanged; the
      // candidates block is additive.
      const recommendedBrief =
        candidates.recommended === "A" ? candidates.candidateA : candidates.candidateB

      res.status(200).json({
        success: true,
        data: {
          brief: recommendedBrief,
          candidates: {
            candidateA: {
              brief: candidates.candidateA,
              previewUrl: buildHeroPreviewDataUrl(candidates.candidateA),
            },
            candidateB: {
              brief: candidates.candidateB,
              previewUrl: buildHeroPreviewDataUrl(candidates.candidateB),
            },
            recommended: candidates.recommended,
            recommendedReason: candidates.recommendedReason,
          },
        },
      })
    })
    .catch((err) => {
      console.error("[plan/sync] failed:", err instanceof Error ? err.message : err)
      next(err)
    })
})

export default router
