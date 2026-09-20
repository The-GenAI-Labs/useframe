import robotsParserImport from "robots-parser"

interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined
  isDisallowed(url: string, ua?: string): boolean | undefined
}

const robotsParser = robotsParserImport as unknown as (url: string, contents: string) => Robot

const USER_AGENT = "UseframeSeoBot"

const robotsCache = new Map<string, Robot | null>()

async function getRobots(origin: string) {
  if (robotsCache.has(origin)) {
    return robotsCache.get(origin) ?? null
  }

  const robotsUrl = `${origin}/robots.txt`

  try {
    const res = await fetch(robotsUrl, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      robotsCache.set(origin, null)
      return null
    }
    const body = await res.text()
    const robots = robotsParser(robotsUrl, body)
    robotsCache.set(origin, robots)
    return robots
  } catch {
    robotsCache.set(origin, null)
    return null
  }
}

export async function isCrawlAllowed(origin: string, targetUrl: string): Promise<boolean> {
  const robots = await getRobots(origin)
  if (!robots) return true
  const allowed = robots.isAllowed(targetUrl, USER_AGENT)
  return allowed !== false
}
