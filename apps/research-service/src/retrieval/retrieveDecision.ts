import { prisma } from "@useframe/db";
import { sparseRank } from "./sparse.js";
import { denseRank } from "./dense.js";
import { reciprocalRankFusion } from "./fuse.js";
import { rerank } from "./rerank.js";

const TOP_FUSED = 20;
const TOP_RERANKED = 4;

export const FINDING_SELECT = {
  id: true,
  claim: true,
  paper: true,
  field: true,
  decision: true,
  options: true,
  contextHeader: true,
  verified: true,
  appliesTo: true,
  audience: true,
} as const;

export type FindingRow = {
  id: string;
  claim: string;
  paper: string;
  field: string;
  decision: string;
  options: unknown;
  contextHeader: string;
  verified: boolean;
  appliesTo: string[];
  audience: string[];
};

export type ScoredFinding = FindingRow & {
  rrfScore: number;
  rerankScore: number | null;
  viaRelation: boolean;
};

// Sparse + dense ranking fused with RRF, reranked, then expanded one hop
// through FindingRelation. Related findings carry viaRelation and no scores.
export async function retrieveDecision(
  query: string,
  decision: string,
  domain: string,
  audience: string,
): Promise<ScoredFinding[]> {
  const candidates: FindingRow[] = await prisma.researchFinding.findMany({
    where: {
      decision,
      appliesTo: { has: domain },
      audience: { has: audience },
    },
    select: FINDING_SELECT,
  });
  if (candidates.length === 0) return [];

  const [sparseRanked, denseRanked] = await Promise.all([
    Promise.resolve(sparseRank(query, candidates)),
    denseRank(
      query,
      candidates.map((c) => c.id),
    ),
  ]);

  const fused = reciprocalRankFusion([sparseRanked, denseRanked]).slice(
    0,
    TOP_FUSED,
  );
  const rrfById = new Map(fused.map((f) => [f.id, f.score]));
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const fusedCandidates = fused
    .map((f) => byId.get(f.id))
    .filter((c): c is FindingRow => !!c);

  const reranked = await rerank(
    query,
    fusedCandidates.map((c) => ({ id: c.id, text: `${c.claim} ${c.paper}` })),
    TOP_RERANKED,
  );

  const topFindings: ScoredFinding[] = reranked.flatMap(({ id, score }) => {
    const row = byId.get(id);
    return row
      ? [
          {
            ...row,
            rrfScore: rrfById.get(id) ?? 0,
            rerankScore: score,
            viaRelation: false,
          },
        ]
      : [];
  });

  const relations = await prisma.findingRelation.findMany({
    where: { findingId: { in: topFindings.map((f) => f.id) } },
  });
  const relatedIds = [
    ...new Set(
      relations.map((r: { relatedFindingId: string }) => r.relatedFindingId),
    ),
  ].filter((id) => !topFindings.some((f) => f.id === id));
  const relatedFindings: ScoredFinding[] =
    relatedIds.length > 0
      ? (
          await prisma.researchFinding.findMany({
            where: { id: { in: relatedIds } },
            select: FINDING_SELECT,
          })
        ).map((row: FindingRow) => ({
          ...row,
          rrfScore: 0,
          rerankScore: null,
          viaRelation: true,
        }))
      : [];

  return [...topFindings, ...relatedFindings];
}
