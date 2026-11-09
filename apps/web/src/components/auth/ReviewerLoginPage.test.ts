import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const NOT_FOUND = new Error("NEXT_NOT_FOUND");

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));
vi.mock("@/lib/metadata", () => import("../../lib/metadata"));
vi.mock("@/components/auth/ReviewerLoginForm", () => ({ default: () => null }));

const { default: ReviewerLoginPage, metadata } = await import(
  "../../../app/(auth)/reviewer-login/page"
);

afterEach(() => vi.unstubAllGlobals());

function stubStatus(status: number | Error) {
  vi.stubGlobal("React", React);
  const fetchMock = vi.fn(async () => {
    if (status instanceof Error) throw status;
    return new Response(null, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("reviewer login page", () => {
  it.each([404, 500, new Error("ECONNREFUSED")])(
    "is a 404 unless the API reports the login enabled (%s)",
    async (status) => {
      stubStatus(status);
      await expect(ReviewerLoginPage()).rejects.toBe(NOT_FOUND);
    },
  );

  it("renders the form when the API answers 204", async () => {
    const fetchMock = stubStatus(204);
    await expect(ReviewerLoginPage()).resolves.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/reviewer-login$/),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("is never indexed", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
  });
});
