import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { ValidationBadge } from "./ValidationBadge";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

type Run = NonNullable<Parameters<typeof ValidationBadge>[0]["run"]>;
const run = (status: Run["status"]): Run => ({
  id: "run",
  startVersionId: "version",
  status,
  finalScore: 96,
  iterationCount: 1,
});
const badge = (status: Run["status"]) =>
  renderToStaticMarkup(ValidationBadge({ run: run(status), pipeline: "MAIN" }));

describe("validation badge transitions", () => {
  it("renders MAIN running, passed and exhausted states", () => {
    expect(badge("RUNNING")).toContain("Quality check running...");
    expect(badge("PASSED")).toContain("✓ Quality verified (96%)");
    expect(badge("FAILED_MAX_ITERATIONS")).toContain("⚠ Minor issues found");
  });
  it("hides errors and absent runs", () => {
    expect(badge("ERROR")).toBe("");
    expect(renderToStaticMarkup(ValidationBadge({ run: null }))).toBe("");
  });
  it("preserves the Replicate exhaustion label", () => {
    expect(
      renderToStaticMarkup(
        ValidationBadge({ run: run("FAILED_MAX_ITERATIONS") }),
      ),
    ).toContain("⚠ Minor discrepancies possible");
  });
});
