import { prisma } from "../index.js"
import { normalizeUrl } from "@repo/schemas"

// "third_party" = a competitor/arbitrary URL not owned by the requesting
// user — safe to cache and share results across users/requests.
// "own_project" = the URL resolves to one of the requesting user's own
// deployments — never cached, since the user's own site can change at any
// time and they expect a fresh scan/score of their own work.
export type CacheContext = "third_party" | "own_project"

const SCAN_TTL_DAYS: Record<CacheContext, number> = { third_party: 14, own_project: 0 }
const ANALYSIS_TTL_DAYS: Record<CacheContext, number> = { third_party: 14, own_project: 0 }

export async function getCachedScan(rawUrl: string, context: CacheContext) {
  if (SCAN_TTL_DAYS[context] === 0) return null
  const normalizedUrl = normalizeUrl(rawUrl)
  return prisma.competitorScan.findFirst({
    where: { normalizedUrl, status: "DONE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  })
}

export async function cacheScan(scanId: string, rawUrl: string, context: CacheContext) {
  if (SCAN_TTL_DAYS[context] === 0) return
  const normalizedUrl = normalizeUrl(rawUrl)
  const expiresAt = new Date(Date.now() + SCAN_TTL_DAYS[context] * 86400000)
  await prisma.competitorScan.update({ where: { id: scanId }, data: { normalizedUrl, expiresAt } })
}

export async function getCachedAnalysis(
  rawUrl: string,
  analysisType: string,
  scorerVersion: string,
  context: CacheContext,
) {
  if (context === "own_project") return null
  const normalizedUrl = normalizeUrl(rawUrl)
  return prisma.scoreResult.findFirst({
    where: { normalizedUrl, analysisType, scorerVersion, status: "DONE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  })
}

export async function cacheAnalysis(
  resultId: string,
  rawUrl: string,
  analysisType: string,
  scorerVersion: string,
  context: CacheContext,
) {
  const normalizedUrl = normalizeUrl(rawUrl)
  const ttlDays = ANALYSIS_TTL_DAYS[context]
  // own_project results are never served from cache (see getCachedAnalysis),
  // but we still stamp normalizedUrl/analysisType/scorerVersion on the row
  // for consistency/future queries; expiresAt is set to "now" so it's
  // immediately eligible for the daily cleanup job rather than lingering.
  const expiresAt = ttlDays > 0 ? new Date(Date.now() + ttlDays * 86400000) : new Date()
  await prisma.scoreResult.update({
    where: { id: resultId },
    data: { normalizedUrl, analysisType, scorerVersion, expiresAt },
  })
}

// Determines whether rawUrl belongs to one of the requesting user's own
// project deployments (own_project) or not (third_party). Used to decide
// whether cache reads/writes apply at all — a user rescanning/scoring their
// own live site should always get a fresh result.
export async function resolveContext(rawUrl: string, userId: string): Promise<CacheContext> {
  const normalizedUrl = normalizeUrl(rawUrl)
  const owned = await prisma.deployment.findFirst({
    where: { liveUrl: { contains: normalizedUrl }, project: { userId } },
  })
  return owned ? "own_project" : "third_party"
}
