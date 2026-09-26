import crypto from "node:crypto"
import { generateObject } from "ai"
import { z } from "zod"
import { Queue } from "bullmq"
import { QUEUES } from "@repo/events"
import type { ScanJobPayload } from "@repo/events"
import { prisma } from "@useframe/db"
import { normalizeUrl } from "@repo/schemas"
import { getClaudeModel } from "@/llm/providers.js"
import { env } from "@/config/env.js"
import { redis } from "@/lib/redis.js"

const SEARCH_QUERY_CACHE_TTL_DAYS = 2

const SearchQueriesSchema = z.object({
  queries: z.array(z.string()).min(1).max(3),
})

const EXCLUDED_DOMAINS = [
  "wikipedia.org",
  "reddit.com",
  "youtube.com",
  "facebook.com",
  "linkedin.com",
  "amazon.com",
  "g2.com",
  "capterra.com",
]

type BraveWebResult = { url: string }
type BraveSearchResponse = {
  web?: { results?: BraveWebResult[] }
}

function isExcluded(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "")
    return EXCLUDED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return true
  }
}

async function generateSearchQueries(
  industry: string,
  ideaText: string,
  audience: string,
): Promise<string[]> {
  const prompt = `
You are helping find real, live competitor websites for a new product so their landing pages
can be analyzed for design/content patterns.

Product idea: "${ideaText}"
Industry: ${industry}
Target audience: ${audience}

Produce 2-3 short web search queries (not questions, just search-engine-style queries) that would
surface real competitor or comparable product websites in this space. Avoid generic terms like
"best X" listicle queries — prefer queries likely to surface actual product/company homepages.
`.trim()

  const { object } = await generateObject({
    model: getClaudeModel(),
    schema: SearchQueriesSchema,
    prompt,
    experimental_telemetry: { isEnabled: true, functionId: "competitor-search-queries" },
  })

  return object.queries
}

async function callBraveApi(query: string): Promise<string[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", query)
  url.searchParams.set("count", "10")

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": env.BRAVE_API_KEY,
    },
  })

  if (!res.ok) {
    console.warn(`[competitorSearch] Brave search failed for query "${query}": HTTP ${res.status}`)
    return []
  }

  const body = (await res.json().catch(() => null)) as BraveSearchResponse | null
  const results = body?.web?.results ?? []
  return results.map((r) => r.url).filter(Boolean)
}

// Wraps callBraveApi with a Postgres-backed cache (SearchQueryCache) keyed on
// a hash of the normalized query text, so repeated/similar competitor
// searches across requests don't re-hit the Brave API. TTL is short (2 days)
// since search result freshness matters more here than for scan/score
// caching.
async function braveSearchCached(query: string): Promise<string[]> {
  const queryHash = crypto.createHash("sha256").update(query.toLowerCase().trim()).digest("hex")

  const cached = await prisma.searchQueryCache.findFirst({
    where: { queryHash, expiresAt: { gt: new Date() } },
  })
  if (cached) return cached.results as string[]

  const results = await callBraveApi(query)

  await prisma.searchQueryCache.create({
    data: {
      queryHash,
      results,
      expiresAt: new Date(Date.now() + SEARCH_QUERY_CACHE_TTL_DAYS * 86400000),
    },
  })

  return results
}

// Finds up to 3 candidate competitor URLs for a given idea by having an LLM
// draft a few search queries, then hitting Brave Search and filtering out
// non-competitor domains (social platforms, marketplaces, review aggregators).
// Gracefully returns [] (no throw) if BRAVE_API_KEY isn't configured or every
// search fails — competitor research is a nice-to-have enrichment step, never
// a hard requirement for generation to proceed.
export async function findCompetitorUrls(
  industry: string,
  ideaText: string,
  audience: string,
): Promise<string[]> {
  if (!env.BRAVE_API_KEY) {
    console.warn("[competitorSearch] BRAVE_API_KEY not set — skipping competitor discovery")
    return []
  }

  let queries: string[]
  try {
    queries = await generateSearchQueries(industry, ideaText, audience)
  } catch (err) {
    console.warn(
      "[competitorSearch] Failed to generate search queries:",
      err instanceof Error ? err.message : err,
    )
    return []
  }

  const resultsPerQuery = await Promise.all(
    queries.map((q) =>
      braveSearchCached(q).catch((err) => {
        console.warn(`[competitorSearch] Brave search threw for query "${q}":`, err)
        return [] as string[]
      }),
    ),
  )

  const seen = new Set<string>()
  const urls: string[] = []

  for (const list of resultsPerQuery) {
    for (const url of list) {
      if (isExcluded(url)) continue
      let normalized: string
      try {
        const u = new URL(url)
        normalized = `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/$/, "")
      } catch {
        continue
      }
      if (seen.has(normalized)) continue
      seen.add(normalized)
      urls.push(url)
      if (urls.length >= 3) return urls
    }
  }

  return urls
}

const scanQueue = new Queue<ScanJobPayload>(QUEUES.SCAN, { connection: redis })

export type CreatedScan = { scanId: string; sourceUrl: string }

// Creates a CompetitorScan row + enqueues a Playwright scan job for each URL,
// reusing the exact same worker path the manual "paste a URL" flow already
// uses (apps/worker's scan.processor.ts) — don't touch that processor, this
// just triggers it from a second call site.
export async function enqueueCompetitorScans(
  urls: string[],
  userId: string,
  projectId: string,
): Promise<CreatedScan[]> {
  const created: CreatedScan[] = []

  for (const [rank, sourceUrl] of urls.entries()) {
    const scan = await prisma.competitorScan.create({
      data: {
        userId,
        projectId,
        sourceUrl,
        normalizedUrl: normalizeUrl(sourceUrl),
        scanType: "COMPETITOR",
        status: "QUEUED",
      },
    })

    // rank 0 is the top-ranked competitor — the only one that gets the
    // video-recording + vision-analysis path in scan.processor.ts.
    const payload: ScanJobPayload = {
      scanId: scan.id,
      userId,
      projectId,
      sourceUrl,
      scanType: "COMPETITOR",
      rank,
    }

    await scanQueue.add("scan", payload, {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    })

    created.push({ scanId: scan.id, sourceUrl })
  }

  return created
}

export type ScanOutcome = {
  scanId: string
  sourceUrl: string
  status: string
  designTokens?: unknown
  extractedContent?: unknown
  // Present only for the top-ranked competitor, and only when the video
  // pipeline ran (see scan.processor.ts).
  videoAnalysis?: unknown
}

// Polls the given scans until every one reaches a terminal state (DONE or
// FAILED) or the timeout elapses, calling onProgress every ~2s so the caller
// can emit SSE progress updates. Returns whatever final state each scan is
// in when polling stops — callers should filter to status === "DONE" for
// usable data, since some may still be FAILED or (on timeout) mid-flight.
export async function waitForScans(
  scanIds: string[],
  opts: { timeoutMs?: number; intervalMs?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<ScanOutcome[]> {
  const timeoutMs = opts.timeoutMs ?? 45_000
  const intervalMs = opts.intervalMs ?? 2_000
  const deadline = Date.now() + timeoutMs

  if (scanIds.length === 0) return []

  let latest: ScanOutcome[] = []

  while (Date.now() < deadline) {
    const scans = await prisma.competitorScan.findMany({
      where: { id: { in: scanIds } },
      select: {
        id: true,
        sourceUrl: true,
        status: true,
        designTokens: true,
        extractedContent: true,
        videoAnalysis: true,
      },
    })

    latest = scans.map(
      (s: {
        id: string
        sourceUrl: string
        status: string
        designTokens: unknown
        extractedContent: unknown
        videoAnalysis: unknown
      }) => ({
        scanId: s.id,
        sourceUrl: s.sourceUrl,
        status: s.status,
        designTokens: s.designTokens ?? undefined,
        extractedContent: s.extractedContent ?? undefined,
        videoAnalysis: s.videoAnalysis ?? undefined,
      }),
    )

    const terminal = latest.filter((s) => s.status === "DONE" || s.status === "FAILED")
    opts.onProgress?.(terminal.length, scanIds.length)

    if (terminal.length === scanIds.length) return latest

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  return latest
}
