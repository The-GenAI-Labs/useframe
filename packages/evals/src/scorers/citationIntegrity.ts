import { prisma } from "@useframe/db"
import type { SiteSpec } from "@repo/schemas"

export type CitationIntegrityResult = {
  pass: boolean
  invalidCitationIds: string[]
  invalidSectionCitationIds: string[]
}

/**
 * Checks that every citation.id in a spec's top-level citations[], and every
 * section.citationIds[] entry, actually points at a real ResearchFinding row
 * — catches a Planner LLM inventing a findingId instead of citing one it was
 * actually given.
 */
export async function checkCitationIntegrity(spec: Partial<SiteSpec>): Promise<CitationIntegrityResult> {
  const allIds = new Set<string>()
  for (const c of spec.citations ?? []) allIds.add(c.id)
  for (const page of spec.pages ?? []) {
    for (const section of page.sections) {
      for (const id of section.citationIds ?? []) allIds.add(id)
    }
  }

  if (allIds.size === 0) {
    return { pass: true, invalidCitationIds: [], invalidSectionCitationIds: [] }
  }

  const rows = await prisma.researchFinding.findMany({
    where: { id: { in: [...allIds] } },
    select: { id: true },
  })
  const validIds = new Set(rows.map((r: { id: string }) => r.id))

  const invalidCitationIds = (spec.citations ?? [])
    .map((c) => c.id)
    .filter((id) => !validIds.has(id))

  const invalidSectionCitationIds: string[] = []
  for (const page of spec.pages ?? []) {
    for (const section of page.sections) {
      for (const id of section.citationIds ?? []) {
        if (!validIds.has(id)) invalidSectionCitationIds.push(id)
      }
    }
  }

  return {
    pass: invalidCitationIds.length === 0 && invalidSectionCitationIds.length === 0,
    invalidCitationIds,
    invalidSectionCitationIds,
  }
}
