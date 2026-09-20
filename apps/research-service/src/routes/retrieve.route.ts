import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { prisma } from "@useframe/db"
import { env } from "@/config/env.js"
import { sparseRank } from "@/retrieval/sparse.js"
import { denseRank } from "@/retrieval/dense.js"
import { reciprocalRankFusion } from "@/retrieval/fuse.js"
import { rerank } from "@/retrieval/rerank.js"
import { mockFindingsFor } from "@/retrieval/mock.js"

const router: Router = Router()

const RetrieveSchema = z.object({
  queries: z.array(z.object({ query: z.string().min(1), decision: z.string().min(1) })).min(1),
  domain: z.string().min(1),
  audience: z.string().min(1),
})

const TOP_FUSED = 20
const TOP_RERANKED = 4

type FindingRow = {
  id: string
  claim: string
  paper: string
  field: string
  decision: string
  options: unknown
  contextHeader: string
  verified: boolean
}

router.post("/retrieve", (req: Request, res: Response, next) => {
  const parsed = RetrieveSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: parsed.error.flatten().fieldErrors,
    })
    return
  }

  const { queries, domain, audience } = parsed.data

  if (env.RESEARCH_MOCK) {
    const results = queries.map(({ decision }) => ({
      decision,
      findings: mockFindingsFor(decision),
    }))
    res.json({ success: true, data: { results } })
    return
  }

  Promise.all(
    queries.map(async ({ query, decision }) => {
      const candidates = await prisma.researchFinding.findMany({
        where: {
          decision,
          appliesTo: { has: domain },
          audience: { has: audience },
        },
        select: {
          id: true,
          claim: true,
          paper: true,
          field: true,
          decision: true,
          options: true,
          contextHeader: true,
          verified: true,
        },
      })

      if (candidates.length === 0) {
        return { decision, findings: [] }
      }

      const candidateIds = candidates.map((c: FindingRow) => c.id)

      const [sparseRanked, denseRanked] = await Promise.all([
        Promise.resolve(sparseRank(query, candidates)),
        denseRank(query, candidateIds),
      ])

      const fused = reciprocalRankFusion([sparseRanked, denseRanked]).slice(0, TOP_FUSED)

      const byId = new Map(candidates.map((c: FindingRow) => [c.id, c]))
      const fusedCandidates = fused
        .map((f) => byId.get(f.id))
        .filter((c): c is FindingRow => !!c)

      const rerankedIds = await rerank(
        query,
        fusedCandidates.map((c) => ({ id: c.id, text: `${c.claim} ${c.paper}` })),
        TOP_RERANKED,
      )

      const topFindings = rerankedIds
        .map((id) => byId.get(id))
        .filter((c): c is FindingRow => !!c)

      const relations = await prisma.findingRelation.findMany({
        where: { fromId: { in: topFindings.map((f) => f.id) } },
      })
      const relatedIds = [...new Set(relations.map((r: { toId: string }) => r.toId))].filter(
        (id) => !topFindings.some((f) => f.id === id),
      )
      const relatedFindings =
        relatedIds.length > 0
          ? await prisma.researchFinding.findMany({
              where: { id: { in: relatedIds } },
              select: {
                id: true,
                claim: true,
                paper: true,
                field: true,
                decision: true,
                options: true,
                contextHeader: true,
                verified: true,
              },
            })
          : []

      return { decision, findings: [...topFindings, ...relatedFindings] }
    }),
  )
    .then((results) => {
      res.json({ success: true, data: { results } })
    })
    .catch(next)
})

export default router
