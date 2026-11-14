import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  relations: vi.fn(),
  denseRank: vi.fn(),
  rerank: vi.fn(),
}));
vi.mock("@useframe/db", () => ({
  prisma: {
    researchFinding: { findMany: mocks.findMany },
    findingRelation: { findMany: mocks.relations },
  },
}));
vi.mock("./dense.js", () => ({ denseRank: mocks.denseRank }));
vi.mock("./rerank.js", () => ({ rerank: mocks.rerank }));

import { retrieveDecision } from "./retrieveDecision.js";

const row = (id: string) => ({
  id,
  claim: `Claim ${id}`,
  paper: "Paper",
  field: "design",
  decision: "typography",
  options: [],
  contextHeader: "",
  verified: true,
  appliesTo: ["EDTECH"],
  audience: ["parents"],
});

describe("legacy retrieveDecision", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only considers VERIFIED findings and skips embedding when none match", async () => {
    mocks.findMany.mockResolvedValue([]);
    expect(
      await retrieveDecision("query", "typography", "EDTECH", "parents"),
    ).toEqual([]);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "VERIFIED",
          decision: "typography",
          appliesTo: { has: "EDTECH" },
          audience: { has: "parents" },
        },
      }),
    );
    expect(mocks.denseRank).not.toHaveBeenCalled();
  });

  it("expands relations to VERIFIED findings only", async () => {
    mocks.findMany
      .mockResolvedValueOnce([row("a")])
      .mockResolvedValueOnce([]);
    mocks.denseRank.mockResolvedValue([]);
    mocks.rerank.mockResolvedValue([{ id: "a", score: 0.9 }]);
    mocks.relations.mockResolvedValue([{ relatedFindingId: "draft-1" }]);
    const result = await retrieveDecision(
      "query",
      "typography",
      "EDTECH",
      "parents",
    );
    expect(result.map((f) => f.id)).toEqual(["a"]);
    expect(mocks.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: { in: ["draft-1"] }, status: "VERIFIED" },
      }),
    );
  });
});
