import { prisma } from "@useframe/db";
import { RetrievalInputSchema } from "@repo/schemas";
import {
  DECISION_AREAS,
  type RetrievalInput,
  type RetrievalResult,
  type RetrievedFinding,
} from "./contract.js";
import { ragConfig, type RagConfig } from "./config.js";
import { voyageProvider, type EmbeddingProvider } from "./embeddings.js";
import { generateHyde, HYDE_PROMPT_VERSION, type HydeResult } from "./hyde.js";
import {
  buildTsQuery,
  cohereRerank,
  denseSearch,
  sparseSearch,
  fuseRanks,
} from "./search.js";
import { ResearchTrace } from "./tracing.js";

export type RetrievalOptions = {
  noCache?: boolean;
  noHyde?: boolean;
  denseOnly?: boolean;
  sparseOnly?: boolean;
  noRerank?: boolean;
};
export type RetrievalDependencies = {
  areaCache?: AreaRetrievalCache;
  db: typeof prisma;
  config: RagConfig;
  embedder: EmbeddingProvider;
  hyde: typeof generateHyde;
  dense: typeof denseSearch;
  sparse: typeof sparseSearch;
  rerank: typeof cohereRerank;
};
export type AreaRetrievalCache = (context: {
  area: RetrievalResult["areas"][number]["area"];
  input: RetrievalInput;
  passage: string;
  keywords: string[];
  config: RagConfig;
  embeddingModel: string;
  trace: ResearchTrace;
  embed: () => Promise<number[]>;
  run: () => Promise<{ findings: RetrievedFinding[]; cacheable: boolean }>;
}) => Promise<RetrievedFinding[]>;
export const FINDING_FIELDS = {
  id: true,
  slug: true,
  title: true,
  statement: true,
  appliesWhen: true,
  category: true,
} as const;
export function createRetriever(
  deps: RetrievalDependencies,
  options: RetrievalOptions = {},
) {
  if (options.denseOnly && options.sparseOnly)
    throw new Error("Choose only one search-only ablation");
  return async (rawInput: RetrievalInput): Promise<RetrievalResult> => {
    const input = RetrievalInputSchema.parse(rawInput);
    const trace = new ResearchTrace("research.retrieve", {
      projectId: input.projectId,
      options,
    });
    let outcome = "SUCCESS";
    try {
      let hyde: HydeResult;
      const direct = (): HydeResult => ({
        areas: DECISION_AREAS.map((area) => ({
          area,
          applies: true,
          passage: input.rawIdea,
          keywords: input.rawIdea.toLowerCase().split(/\s+/).slice(0, 12),
        })),
      });
      if (options.noHyde) hyde = direct();
      else {
        try {
          hyde = await trace.span(
            "hyde",
            { version: HYDE_PROMPT_VERSION },
            () => deps.hyde(input),
          );
        } catch {
          trace.event("fallback.hyde", { strategy: "raw_idea" });
          hyde = direct();
        }
      }
      const areas: RetrievalResult["areas"] = [];
      let cursor = 0;
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (cursor < DECISION_AREAS.length) {
            const area = DECISION_AREAS[cursor++]!;
            const query = hyde.areas.find((q) => q.area === area)!;
            let findings: RetrievedFinding[] = [];
            if (query.applies) {
              let embedding: Promise<number[]> | undefined;
              const embed = () =>
                (embedding ??= trace.span(
                  `${area}.embed_query`,
                  { model: deps.embedder.model },
                  async () => {
                    const vector = await deps.embedder.embedQuery(
                      query.passage,
                    );
                    if (
                      vector.length !== deps.embedder.dims ||
                      vector.some((n) => !Number.isFinite(n))
                    )
                      throw new Error("Query embedding dimension mismatch");
                    return vector;
                  },
                  (v) => ({ dimensions: v.length }),
                ));
              const run = async () => {
                const findings: RetrievedFinding[] = [];
                let cacheable = true;
                const tsquery = buildTsQuery(query.keywords);
                const [dense, sparse] = await Promise.all([
                  options.sparseOnly
                    ? []
                    : (async () => {
                        try {
                          const vector = await embed();
                          return await trace.span(`${area}.dense`, {}, () =>
                            deps.dense(
                              vector,
                              deps.embedder.model,
                              deps.config.DENSE_CANDIDATES,
                            ),
                          );
                        } catch {
                          cacheable = false;
                          trace.event(`${area}.fallback.dense`, {
                            strategy: "sparse_only",
                          });
                          return [];
                        }
                      })(),
                  options.denseOnly || !tsquery
                    ? []
                    : trace
                        .span(`${area}.sparse`, { tsquery }, () =>
                          deps.sparse(tsquery, deps.config.SPARSE_CANDIDATES),
                        )
                        .catch(() => {
                          cacheable = false;
                          trace.event(`${area}.fallback.sparse`, {
                            strategy: "dense_only",
                          });
                          return [];
                        }),
                ]);
                const fused = fuseRanks(
                  [dense, sparse],
                  deps.config.RRF_K,
                ).slice(0, deps.config.FUSED_CANDIDATES);
                trace.event(`${area}.rrf`, fused);
                const rows = await deps.db.researchFinding.findMany({
                  where: {
                    id: { in: fused.map((f) => f.id) },
                    status: "VERIFIED",
                  },
                  select: FINDING_FIELDS,
                });
                const byId = new Map(rows.map((f) => [f.id, f]));
                const candidates = fused.flatMap((rank) => {
                  const row = byId.get(rank.id);
                  return row ? [{ ...row, rrfScore: rank.score }] : [];
                });
                let selected: Array<{ index: number; score: number | null }> =
                  [];
                if (candidates.length && !options.noRerank) {
                  try {
                    const reranked = await trace.span(
                      `${area}.rerank`,
                      { ids: candidates.map((c) => c.id) },
                      () =>
                        deps.rerank(
                          query.passage,
                          candidates.map(
                            (f) =>
                              `${f.title}. ${f.statement}${f.appliesWhen ? ` Applies to: ${f.appliesWhen}` : ""}`,
                          ),
                          deps.config,
                        ),
                    );
                    selected = reranked
                      .filter(
                        (r) =>
                          r.relevance_score >= deps.config.RERANK_MIN_SCORE,
                      )
                      .slice(0, deps.config.PER_AREA_TOP_K)
                      .map((r) => ({
                        index: r.index,
                        score: r.relevance_score,
                      }));
                  } catch {
                    cacheable = false;
                    trace.event(`${area}.fallback.rerank`, { strategy: "rrf" });
                    selected = candidates
                      .slice(0, deps.config.PER_AREA_TOP_K)
                      .map((_, index) => ({ index, score: null }));
                  }
                } else
                  selected = candidates
                    .slice(0, deps.config.PER_AREA_TOP_K)
                    .map((_, index) => ({ index, score: null }));
                for (const selection of selected) {
                  const f = candidates[selection.index];
                  if (!f || findings.some((row) => row.findingId === f.id))
                    continue;
                  findings.push({
                    findingId: f.id,
                    slug: f.slug,
                    title: f.title,
                    statement: f.statement,
                    appliesWhen: f.appliesWhen,
                    category: f.category,
                    rrfScore: f.rrfScore,
                    rerankScore: selection.score,
                    viaRelation: false,
                  });
                }
                if (findings.length) {
                  const ids = findings.map((f) => f.findingId);
                  const relations = await deps.db.findingRelation.findMany({
                    where: {
                      relationType: {
                        in: ["SUPPORTS", "OFTEN_CITED_TOGETHER", "REFINES"],
                      },
                      OR: [
                        { findingId: { in: ids } },
                        { relatedFindingId: { in: ids } },
                      ],
                    },
                    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                  });
                  const relatedIds = [
                    ...new Set(
                      relations
                        .flatMap((r) => [r.findingId, r.relatedFindingId])
                        .filter((id) => !ids.includes(id)),
                    ),
                  ];
                  const related = await deps.db.researchFinding.findMany({
                    where: { id: { in: relatedIds }, status: "VERIFIED" },
                    select: FINDING_FIELDS,
                  });
                  const ordered = relatedIds
                    .flatMap((id) => {
                      const row = related.find((r) => r.id === id);
                      return row ? [row] : [];
                    })
                    .slice(0, 2);
                  findings.push(
                    ...ordered.map((f) => ({
                      findingId: f.id,
                      slug: f.slug,
                      title: f.title,
                      statement: f.statement,
                      appliesWhen: f.appliesWhen,
                      category: f.category,
                      rrfScore: 0,
                      rerankScore: null,
                      viaRelation: true,
                    })),
                  );
                  trace.event(
                    `${area}.expansion`,
                    ordered.map((f) => f.id),
                  );
                }
                return { findings, cacheable };
              };
              const useCache =
                deps.areaCache &&
                !options.noCache &&
                !options.noHyde &&
                !options.noRerank &&
                !options.denseOnly &&
                !options.sparseOnly;
              findings = useCache
                ? await deps.areaCache!({
                    area,
                    input,
                    passage: query.passage,
                    keywords: query.keywords,
                    config: deps.config,
                    embeddingModel: deps.embedder.model,
                    trace,
                    embed,
                    run,
                  })
                : (await run()).findings;
            }
            areas.push({ area, hydePassage: query.passage, findings });
          }
        }),
      );
      const ids = [
        ...new Set(areas.flatMap((a) => a.findings.map((f) => f.findingId))),
      ];
      const conflicts = ids.length
        ? await deps.db.findingRelation.findMany({
            where: {
              relationType: "CONFLICTS",
              findingId: { in: ids },
              relatedFindingId: { in: ids },
            },
            orderBy: { id: "asc" },
          })
        : [];
      const pairs = new Set<string>();
      const tensions = conflicts.flatMap((r) => {
        const [a, b] = [r.findingId, r.relatedFindingId].sort();
        const key = `${a}:${b}`;
        if (pairs.has(key)) return [];
        pairs.add(key);
        return [{ findingIdA: a!, findingIdB: b!, note: r.note }];
      });
      return {
        areas: DECISION_AREAS.map(
          (area) => areas.find((a) => a.area === area)!,
        ),
        tensions,
      };
    } catch (error) {
      outcome = "FAILED";
      throw error;
    } finally {
      await trace.finish(outcome);
    }
  };
}
export function retrieveForProject(
  input: RetrievalInput,
  areaCache?: AreaRetrievalCache,
): Promise<RetrievalResult> {
  return retrieveWithOptions(input, {}, areaCache);
}
export function retrieveWithOptions(
  input: RetrievalInput,
  options: RetrievalOptions = {},
  areaCache?: AreaRetrievalCache,
): Promise<RetrievalResult> {
  const config = ragConfig();
  return createRetriever(
    {
      areaCache,
      db: prisma,
      config,
      embedder: voyageProvider(config),
      hyde: generateHyde,
      dense: denseSearch,
      sparse: sparseSearch,
      rerank: cohereRerank,
    },
    options,
  )(input);
}
