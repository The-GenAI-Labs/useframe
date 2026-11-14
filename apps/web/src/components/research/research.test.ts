import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseFindingStatement } from "@repo/schemas";

const NOT_FOUND = new Error("NEXT_NOT_FOUND");
const redirects: string[] = [];

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
  redirect: (url: string) => {
    redirects.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/metadata", () => import("../../lib/metadata"));
vi.mock("@/lib/researchArticles", () => import("../../lib/researchArticles"));
vi.mock("@/lib/researchCategories", () => import("../../lib/researchCategories"));
vi.mock("@/components/legal/LegalMarkdown", () => import("../legal/LegalMarkdown"));
vi.mock("@/lib/legal-content", () => ({ headingId: (text: string) => text.toLowerCase().replace(/\W+/g, "-") }));
vi.mock("@/components/home/Navbar", () => ({ Navbar: () => null }));
vi.mock("@/components/home/sections/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/home/fonts", () => ({ landingFont: { className: "font" } }));
vi.mock("@/components/research/ResearchLibraryView", () => ({ default: () => null }));
vi.mock("@/components/research/FindingDetailView", () => ({ default: () => null }));
vi.mock("@/lib/authContext", () => ({ getCurrentAccessToken: () => null, refreshAccessToken: async () => null }));
vi.mock("@/components/shared/PageFadeIn", () => ({ PageFadeIn: ({ children }: { children: unknown }) => children }));

vi.stubGlobal("React", React);

const { FindingStatement } = await import("./FindingStatement");
const articlePage = await import("../../../app/research/[slug]/page");
const listPage = await import("../../../app/research/page");
const libraryPage = await import("../../../app/(chat)/research/library/page");
const libraryDetailPage = await import("../../../app/(chat)/research/library/[slug]/page");

const article = {
  slug: "colour-basics",
  title: "Colour basics",
  category: "COLOR_PSYCHOLOGY",
  summary: `Why colour matters. ${"Long summary text. ".repeat(12)}`,
  tags: ["color", "trust"],
  publishedAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-02T00:00:00.000Z",
  sections: [{ heading: "What the studies found", body: "Warm colours **raise** urgency." }],
  body: "unused",
  references: [
    { title: "A study", url: "https://example.org/p", authors: "Doe, J.", year: 2021, venue: "CHI", doi: null },
    { title: "With DOI", url: null, authors: null, year: 2020, venue: null, doi: "10.1/abc" },
  ],
};

type Routes = Record<string, { status: number; body?: unknown }>;
function stubApi(routes: Routes) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      const route = routes[path] ?? { status: 404 };
      return route.status === 200 ? Response.json({ success: true, data: route.body }) : new Response(null, { status: route.status });
    }),
  );
}

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  redirects.length = 0;
  vi.stubGlobal("React", React);
});
afterEach(() => vi.unstubAllGlobals());

describe("finding statement", () => {
  const statement =
    "Warm palettes raise urgency on sale pages.\n\nOptions:\n- Warm palette: warm-red (fits: Food, Retail)\n- Ratio: 60:30:10\n- Cool palette: cool";

  it("parses the converter's Options block", () => {
    expect(parseFindingStatement(statement)).toEqual({
      claim: "Warm palettes raise urgency on sale pages.",
      options: [
        { label: "Warm palette", value: "warm-red", fits: ["Food", "Retail"] },
        { label: "Ratio", value: "60:30:10", fits: [] },
        { label: "Cool palette", value: "cool", fits: [] },
      ],
    });
    expect(parseFindingStatement(statement.replace(/\n/g, "\r\n")).options).toHaveLength(3);
  });

  it("renders the claim and a clean options list", () => {
    const html = renderToStaticMarkup(React.createElement(FindingStatement, { statement }));
    expect(html).toContain("<p class=\"text-[17px]");
    expect(html).toContain("Warm palettes raise urgency on sale pages.");
    expect(html).not.toContain("Options:");
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html).toContain("Good for:");
    expect(html).toContain("Retail");
  });

  it("renders a statement without an Options block as plain text", () => {
    const html = renderToStaticMarkup(React.createElement(FindingStatement, { statement: "Just a claim, nothing more." }));
    expect(html).toContain("Just a claim, nothing more.");
    expect(html).not.toContain("<ul");
    expect(parseFindingStatement("Plain\n\nNo options here")).toEqual({ claim: "Plain\n\nNo options here", options: [] });
  });
});

describe("public article pages", () => {
  it("renders an article with Article JSON-LD, citations, references and tags", async () => {
    stubApi({ "/api/research/articles/colour-basics": { status: 200, body: article } });
    const html = renderToStaticMarkup(await articlePage.default(params("colour-basics")));
    const json = /<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)?.[1];
    const data = JSON.parse(json!.replace(/\\u003c/g, "<"));
    expect(data).toMatchObject({
      "@type": "Article",
      headline: "Colour basics",
      url: "https://useframe.in/research/colour-basics",
      citation: [
        { "@type": "CreativeWork", name: "A study", url: "https://example.org/p", author: "Doe, J.", datePublished: "2021" },
        { "@type": "CreativeWork", name: "With DOI", url: "https://doi.org/10.1/abc" },
      ],
    });
    expect(data.description.length).toBeLessThanOrEqual(160);
    expect(html).toContain("What the studies found");
    expect(html).toContain("<strong");
    expect(html).toContain('href="https://doi.org/10.1/abc" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain(">trust<");
  });

  it("builds indexable metadata with a canonical and a summary description", async () => {
    stubApi({ "/api/research/articles/colour-basics": { status: 200, body: article } });
    const metadata = await articlePage.generateMetadata(params("colour-basics"));
    expect(metadata.alternates).toEqual({ canonical: "/research/colour-basics" });
    expect(String(metadata.description).length).toBeLessThanOrEqual(160);
    expect(metadata.openGraph).toMatchObject({ type: "article", url: "/research/colour-basics" });
  });

  it("redirects an old finding id link to the library and 404s anything else", async () => {
    stubApi({ "/api/findings/cmold123": { status: 200, body: { id: "cmold123", slug: "warm-colours", title: "Warm" } } });
    await expect(articlePage.default(params("cmold123"))).rejects.toThrow("NEXT_REDIRECT");
    expect(redirects).toEqual(["/research/library/warm-colours"]);
    await expect(articlePage.default(params("nothing-here"))).rejects.toBe(NOT_FOUND);
  });

  it("groups the article list by category and filters by category", async () => {
    stubApi({
      "/api/research/articles": {
        status: 200,
        body: [
          { ...article, slug: "a", title: "Alpha" },
          { ...article, slug: "b", title: "Beta", category: "TYPOGRAPHY" },
        ],
      },
    });
    const all = renderToStaticMarkup(await listPage.default({ searchParams: Promise.resolve({}) }));
    expect(all).toContain("Color psychology");
    expect(all).toContain('href="/research/a"');
    expect(all).toContain('href="/research/b"');
    const filtered = renderToStaticMarkup(await listPage.default({ searchParams: Promise.resolve({ category: "TYPOGRAPHY" }) }));
    expect(filtered).not.toContain('href="/research/a"');
    expect(filtered).toContain('href="/research/b"');
    expect(listPage.metadata.alternates).toEqual({ canonical: "/research" });
  });

  it("shows an error state instead of failing when the API is down", async () => {
    stubApi({ "/api/research/articles": { status: 500 } });
    const html = renderToStaticMarkup(await listPage.default({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('role="alert"');
  });
});

describe("research library pages", () => {
  it("are never indexed", () => {
    for (const page of [libraryPage, libraryDetailPage]) {
      expect(page.metadata.robots).toEqual({ index: false, follow: false });
      expect(page.metadata.alternates).toBeUndefined();
    }
  });
});

describe("research api errors", () => {
  it("reads the status and lock code the axios interceptor attaches", async () => {
    const { apiErrorStatus, isResearchLocked } = await import("../../lib/api/services/researchLibrary.service");
    const locked = Object.assign(new Error("This finding is part of the full research library"), { status: 403, code: "RESEARCH_LOCKED" });
    const missing = Object.assign(new Error("Not found"), { status: 404 });
    expect(isResearchLocked(locked)).toBe(true);
    expect(apiErrorStatus(locked)).toBe(403);
    expect(isResearchLocked(missing)).toBe(false);
    expect(apiErrorStatus(missing)).toBe(404);
    expect(apiErrorStatus("boom")).toBeNull();
  });
});
