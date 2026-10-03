import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  model: vi.fn(),
  options: vi.fn(),
  iterate: vi.fn(),
}));
vi.mock("../../../apps/orchestrator-service/node_modules/ai", () => ({
  generateObject: mocks.generate,
  NoObjectGeneratedError: {
    isInstance: (error: unknown) =>
      error instanceof Error && error.name === "NoObjectGeneratedError",
  },
}));
vi.mock("../../../apps/orchestrator-service/src/llm/router.js", () => ({
  getModelForTier: mocks.model,
  getProviderOptionsForTier: mocks.options,
}));
vi.mock(
  "../../../apps/orchestrator-service/src/agents/iterate.agent.js",
  () => ({ runIteration: mocks.iterate }),
);
vi.mock("../../schemas/dist/index.js", () => ({
  SiteSpecSchema: { parse: (value: unknown) => value },
}));
import { compareMain } from "../../../apps/orchestrator-service/src/validation/mainComparison.js";
import { iterateMainValidation } from "../../../apps/orchestrator-service/src/validation/mainIteration.js";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.generate.mockResolvedValue({
    object: { score: 98, issues: [], summary: "Complete" },
  });
});
it("uses the paid router once for all images with text brief and no references", async () => {
  const images = Array.from({ length: 6 }, (_, i) => ({
    section: `section-${i}`,
    image: Buffer.from("fixture"),
  }));
  expect((await compareMain({ color: "blue" }, images)).score).toBe(98);
  expect(mocks.generate).toHaveBeenCalledOnce();
  expect(mocks.model).toHaveBeenCalledWith("paid");
  const call = mocks.generate.mock.calls[0]![0];
  expect(
    call.messages[0].content.filter(
      (part: { type: string }) => part.type === "image",
    ),
  ).toHaveLength(6);
  expect(call.maxRetries).toBe(0);
});
it("retries SDK malformed-output failures exactly once", async () => {
  mocks.generate.mockRejectedValueOnce(
    Object.assign(new Error("invalid JSON"), {
      name: "NoObjectGeneratedError",
    }),
  );
  await compareMain({ color: "blue" }, [
    { section: "hero", image: Buffer.from("fixture") },
  ]);
  expect(mocks.generate).toHaveBeenCalledTimes(2);
});
it("uses content-only iteration without the old design override", async () => {
  const base = { id: "v1", siteType: "SINGLE_PAGE", snapshot: { pages: [] } };
  mocks.iterate.mockResolvedValue({
    changed: true,
    updatedSpec: {
      siteType: "SINGLE_PAGE",
      pages: [{ title: "Finished content" }],
    },
  });
  await iterateMainValidation("project", base, "Finish the heading");
  expect(mocks.iterate.mock.calls[0]).toHaveLength(1);
  mocks.iterate.mockResolvedValue({
    changed: false,
    updatedSpec: { ...base.snapshot, siteType: base.siteType },
  });
  await expect(
    iterateMainValidation("project", base, "Change architecture"),
  ).rejects.toThrow("No supported content correction");
});
