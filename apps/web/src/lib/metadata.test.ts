import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/metadata");
  vi.doUnmock("@/lib/legal");
  vi.doUnmock("@/lib/researchArticles");
  vi.resetModules();
});

async function metadataFor(
  nodeEnv: "development" | "production",
  vercelEnv?: string,
  indexingEnabled?: string,
) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  vi.stubEnv("SITE_INDEXING_ENABLED", indexingEnabled);
  vi.doMock("@/lib/metadata", async () => import("./metadata"));
  vi.doMock("@/lib/legal", async () => import("./legal"));
  vi.doMock("@/lib/researchArticles", async () => import("./researchArticles"));
  return import("./metadata");
}

describe("page metadata indexing policy", () => {
  it("keeps unspecified routes private even in production", async () => {
    const { pageMetadata } = await metadataFor("production", "production");
    const metadata = pageMetadata("Website Workspace", "Manage your website.");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
    expect(metadata.openGraph).not.toHaveProperty("url");
  });

  it.each([
    ["development", undefined],
    ["production", "preview"],
    ["production", "development"],
  ] as const)(
    "does not index public pages in %s / %s",
    async (nodeEnv, vercelEnv) => {
      const { pageMetadata } = await metadataFor(nodeEnv, vercelEnv);
      expect(
        pageMetadata("Home", "Build a website.", { path: "/", indexable: true })
          .robots,
      ).toMatchObject({ index: false, follow: false });
    },
  );

  it.each([undefined, "production"])(
    "indexes explicitly public production pages (%s)",
    async (vercelEnv) => {
      const { pageMetadata } = await metadataFor("production", vercelEnv);
      const metadata = pageMetadata("Home", "Build a website.", {
        path: "/",
        indexable: true,
      });
      expect(metadata.robots).toMatchObject({ index: true, follow: true });
      expect(metadata.alternates).toEqual({ canonical: "/" });
    },
  );

  it("keeps page copy and the existing image consistent across share cards", async () => {
    const { pageMetadata } = await metadataFor("production");
    const metadata = pageMetadata("Sign In", "Access your account.");
    expect(metadata.openGraph).toMatchObject({
      title: "Sign In | useframe",
      description: "Access your account.",
      images: [expect.objectContaining({ url: "/og-image.png" })],
    });
    expect(metadata.title).toEqual({ absolute: "Sign In | useframe" });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Sign In | useframe",
      description: "Access your account.",
      images: [expect.objectContaining({ url: "/og-image.png" })],
    });
  });

  it("uses an exact title on every surface when one is given", async () => {
    const { pageMetadata } = await metadataFor("production");
    const metadata = pageMetadata("Contact", "Reach us.", {
      fullTitle: "Contact UseFrame",
    });
    expect(metadata.title).toEqual({ absolute: "Contact UseFrame" });
    expect(metadata.openGraph).toMatchObject({ title: "Contact UseFrame" });
    expect(metadata.twitter).toMatchObject({ title: "Contact UseFrame" });
  });

  it.each(["false", "", "invalid"])(
    "disables production indexing when the override is %j",
    async (indexingEnabled) => {
      const { pageMetadata } = await metadataFor(
        "production",
        undefined,
        indexingEnabled,
      );
      expect(
        pageMetadata("Home", "Build a website.", { path: "/", indexable: true })
          .robots,
      ).toMatchObject({ index: false, follow: false });
    },
  );

  it("cannot enable indexing on a preview deployment", async () => {
    const { isIndexableDeployment } = await metadataFor(
      "production",
      "preview",
      "true",
    );
    expect(isIndexableDeployment).toBe(false);
  });

  it("serves the public canonical pages in the production sitemap", async () => {
    const { SITE_URL } = await metadataFor("production", "production", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          success: true,
          data: [{ slug: "colour-basics", title: "Colour", category: "COLOR_PSYCHOLOGY", summary: "s", tags: [], publishedAt: "2026-11-01T00:00:00.000Z" }],
        }),
      ),
    );
    const { default: sitemap } = await import("../../app/sitemap");
    const { default: robots } = await import("../../app/robots");

    const legalPage = (path: string) => ({
      url: `${SITE_URL}${path}`,
      lastModified: "2026-11-09",
      priority: 0.3,
    });
    expect(await sitemap()).toEqual([
      { url: `${SITE_URL}/` },
      { url: `${SITE_URL}/pricing` },
      { url: `${SITE_URL}/research`, priority: 0.6 },
      { url: `${SITE_URL}/research/colour-basics`, lastModified: "2026-11-01T00:00:00.000Z", priority: 0.5 },
      legalPage("/privacy"),
      legalPage("/terms"),
      legalPage("/refund-policy"),
      legalPage("/delivery-policy"),
      legalPage("/contact"),
    ]);
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: `${SITE_URL}/sitemap.xml`,
    });
  });

  it.each([
    ["development", undefined, undefined],
    ["production", "preview", undefined],
    ["production", undefined, "false"],
  ] as const)(
    "excludes URLs from crawler files in %s / %s / %s",
    async (nodeEnv, vercelEnv, indexingEnabled) => {
      await metadataFor(nodeEnv, vercelEnv, indexingEnabled);
      const { default: sitemap } = await import("../../app/sitemap");
      const { default: robots } = await import("../../app/robots");

      expect(await sitemap()).toEqual([]);
      expect(robots()).toEqual({
        rules: { userAgent: "*", disallow: "/" },
      });
    },
  );

  it("advertises the actual dimensions of the bundled share image", async () => {
    const { pageMetadata } = await metadataFor("production");
    const image = readFileSync(
      fileURLToPath(new URL("../../public/og-image.png", import.meta.url)),
    );
    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(pageMetadata("Home", "Build a website.").openGraph).toMatchObject({
      images: [
        expect.objectContaining({
          width: image.readUInt32BE(16),
          height: image.readUInt32BE(20),
        }),
      ],
    });
  });
});
