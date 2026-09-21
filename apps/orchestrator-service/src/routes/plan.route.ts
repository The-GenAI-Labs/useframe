import { Router, type Request, type Response, type NextFunction } from "express"
import { z } from "zod"
import { PlanSSERequestSchema, buildHeroPreviewDataUrl } from "@repo/schemas"
import type { DesignBrief, DesignBriefCandidates } from "@repo/schemas"
import { verifyToken } from "@/lib/auth.js"
import { initSSE, sseWrite, sseError } from "@/llm/stream.js"
import { getModelForTier } from "@/llm/router.js"
import { runPlannerAgent, runPlannerCandidatesAgent } from "@/agents/planner.agent.js"
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

      // Competitor research is paid-tier only. The DeepSeek-only model router
      // protects the generation LLM call, but did nothing to gate the Brave
      // search + Playwright scanning below — both are real external cost per
      // request, so free tier skips them entirely and goes straight to corpus
      // retrieval (DB-only, no external calls). An explicit sourceUrl (the
      // user's own site) is still honoured, since that's their own input
      // rather than discovery we paid for.
      let competitorUrls: string[] = []

      if (sourceUrl) {
        competitorUrls = [sourceUrl]
      } else if (tier === "paid") {
        sseWrite(res, {
          type: "stage",
          stage: "SCAN",
          message: "Discovering competitors...",
        })

        competitorUrls = await findCompetitorUrls(domain, ideaText, audience).catch((err) => {
          console.warn("[plan] competitor discovery failed, continuing without it:", err)
          return []
        })
        competitorUrls = competitorUrls.slice(0, 3)
      }

      let scannedCompetitors: {
        sourceUrl: string
        designTokens?: unknown
        extractedContent?: unknown
        videoAnalysis?: unknown
      }[] = []

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
            // Only the top-ranked competitor carries this, and only when the
            // video pipeline ran — it's richer motion/pattern context than
            // static design tokens, fed in as inspiration, never as content
            // to reproduce.
            videoAnalysis: o.videoAnalysis,
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

      // Free tier resolves to ONE brief — no second candidate, no preview
      // render. The A/B picker doubles the planner call and adds two renders,
      // which is paid-tier value, not a free-tier default.
      const isPaid = tier === "paid"

      sseWrite(res, {
        type: "stage",
        stage: "RESEARCH",
        message: isPaid ? "Compiling two design directions..." : "Compiling design brief...",
      })

      const plannerVars = { extracted: plannerExtracted, results, domainPattern, audienceModifier }

      const [plannerOutput, researchReport] = await Promise.all([
        isPaid
          ? runPlannerCandidatesAgent(plannerVars, model)
          : runPlannerAgent(plannerVars, model),
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

      const candidates = isPaid ? (plannerOutput as DesignBriefCandidates) : null
      const singleBrief = isPaid ? null : (plannerOutput as DesignBrief)

      // On the paid path ProjectVersion.designBrief is deliberately NOT
      // written here — with two candidates there is no chosen brief yet, so
      // it's stored by POST /api/projects/:slug/plan/select once the user
      // picks. On the free path there's only one brief and no picker, so it
      // is the chosen brief and is persisted immediately.
      if (singleBrief) {
        await prisma.projectVersion.update({
          where: { id: versionId },
          data: { designBrief: singleBrief as unknown as Prisma.InputJsonValue },
        })
      }

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

      if (candidates) {
        sseWrite(res, {
          type: "stage",
          stage: "RESEARCH",
          message: "Rendering previews...",
        })

        // Hero previews are inline SVG data URLs built synchronously from each
        // brief's own colours/typography — no browser, no upload, nothing to
        // clean up. See buildHeroPreviewDataUrl in @repo/schemas.
        sseWrite(res, {
          type: "candidates_ready",
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
          competitorInsights: researchReport.competitorInsights,
        })
      } else {
        // Free tier: one resolved brief, no picker to wait on.
        sseWrite(res, {
          type: "brief_ready",
          brief: singleBrief!,
          competitorInsights: researchReport.competitorInsights,
        })
      }

      // Stream ends here — it does not auto-proceed to /generate. On the paid
      // path the user picks a direction via /plan/select first; on the free
      // path the brief is already resolved and stored.
      sseWrite(res, {
        type: "stage",
        stage: "COMPLETE",
        message: candidates ? "Two design directions ready." : "Design brief ready.",
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
