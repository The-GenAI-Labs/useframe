import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@/lib/metadata");
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

  it("serves only the public canonical homepage in the production sitemap", async () => {
    const { SITE_URL } = await metadataFor("production", "production", "true");
    const { default: sitemap } = await import("../../app/sitemap");
    const { default: robots } = await import("../../app/robots");

    expect(sitemap()).toEqual([{ url: `${SITE_URL}/` }]);
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

      expect(sitemap()).toEqual([]);
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
