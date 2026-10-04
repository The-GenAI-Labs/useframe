import type { Db } from "./sync.js";
import { buildLabel, hostFor, isValidLabel, randomSuffix } from "./label.js";

const SHORT_ATTEMPTS = 5;

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

// Label is assigned once and never changes; nothing else writes subdomainLabel/defaultHost.
export async function ensureSite(
  db: Db,
  projectId: string,
  baseDomain: string,
  suffix: (length: number) => string = randomSuffix,
) {
  const existing = await db.projectSite.findUnique({ where: { projectId } });
  if (existing) return existing;

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true },
  });

  for (let attempt = 0; attempt < SHORT_ATTEMPTS + 3; attempt++) {
    const label = buildLabel(project.name, suffix(attempt < SHORT_ATTEMPTS ? 3 : 4));
    if (!isValidLabel(label)) continue;
    const host = hostFor(label, baseDomain);
    try {
      return await db.projectSite.create({
        data: { projectId, subdomainLabel: label, defaultHost: host, primaryHost: host },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await db.projectSite.findUnique({ where: { projectId } });
      if (raced) return raced;
    }
  }
  throw new Error(`Could not allocate a unique subdomain label for project ${projectId}`);
}
