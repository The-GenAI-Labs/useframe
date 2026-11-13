import { prisma } from "@useframe/db"

// The single entitlement rule for research findings. Credit packs never expire, so neither does this.
// Refunded, partially refunded, flagged, failed and pending payments never count.
export async function hasFullResearchAccess(userId: string): Promise<boolean> {
  const payment = await prisma.payment.findFirst({
    where: { userId, status: "SUCCESS", plan: { unlocksFullResearch: true } },
    select: { id: true },
  })
  return payment !== null
}

// Ownership goes through the saved citation rows, never through anything the client sent.
export async function isFindingCitedInOwnProject(userId: string, findingId: string): Promise<boolean> {
  const citation = await prisma.researchReportCitation.findFirst({
    where: { findingId, researchReport: { project: { userId, deletedAt: null } } },
    select: { id: true },
  })
  return citation !== null
}

export async function canOpenFinding(userId: string, findingId: string): Promise<boolean> {
  return (await hasFullResearchAccess(userId)) || isFindingCitedInOwnProject(userId, findingId)
}

export async function researchUpgradePlan(): Promise<{ slug: string; name: string } | null> {
  return prisma.plan.findFirst({
    where: { isActive: true, unlocksFullResearch: true },
    orderBy: { priceMinor: "desc" },
    select: { slug: true, name: true },
  })
}
