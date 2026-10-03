import { Router, type Request, type Response } from "express"
import { z } from "zod"
import { env } from "@/config/env.js"
import { retrieveDecision } from "@/retrieval/retrieveDecision.js"
import { mockFindingsFor } from "@/retrieval/mock.js"

const router: Router = Router()

const RetrieveSchema = z.object({
  queries: z.array(z.object({ query: z.string().min(1), decision: z.string().min(1) })).min(1),
  domain: z.string().min(1),
  audience: z.string().min(1),
})

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
    queries.map(async ({ query, decision }) => ({
      decision,
      findings: await retrieveDecision(query, decision, domain, audience),
    })),
  )
    .then((results) => {
      res.json({ success: true, data: { results } })
    })
    .catch(next)
})

export default router
