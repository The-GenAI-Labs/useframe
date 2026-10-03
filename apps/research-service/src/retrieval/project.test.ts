import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  env: { RESEARCH_MOCK: false },
  retrieve: vi.fn(),
  save: vi.fn(),
  get: vi.fn(),
}));
vi.mock("@/config/env.js", () => ({ env: mocks.env }));
vi.mock("@repo/rag", async () => ({
  ...(await vi.importActual<typeof import("@repo/rag")>("@repo/rag")),
  retrieveForProject: mocks.retrieve,
  saveCitations: mocks.save,
  getProjectResearch: mocks.get,
}));
import {
  retrieveForProject,
  saveCitations,
  getProjectResearch,
} from "./project.js";
const input = {
  projectId: "test",
  rawIdea: "An accessible shop",
  niche: "ECOMMERCE" as const,
  intakeAnswers: {},
};
describe("Phase 1 adapter", () => {
  it("delegates to the real corpus contract", async () => {
    mocks.env.RESEARCH_MOCK = false;
    mocks.retrieve.mockResolvedValue({ areas: [], tensions: [] });
    await retrieveForProject(input);
    expect(mocks.retrieve).toHaveBeenCalledWith(input, expect.any(Function));
    expect(saveCitations).toBe(mocks.save);
    expect(getProjectResearch).toBe(mocks.get);
  });
  it("never exposes fabricated findings in mock mode", async () => {
    mocks.env.RESEARCH_MOCK = true;
    const result = await retrieveForProject(input);
    expect(result.areas).toHaveLength(9);
    expect(result.areas.every((a) => !a.findings.length)).toBe(true);
  });
});
