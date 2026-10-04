import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/schema.js";
import { dependencyHash, detectFramework } from "@/pipeline/detect.js";
import { DeployError, publicReason } from "@/pipeline/errors.js";
import { filesFromVersion } from "@/pipeline/files.js";
import { safeJoin } from "@/pipeline/materialize.js";
import { cacheControlFor, contentTypeFor } from "@/pipeline/upload.js";
import { selectForPurge } from "@/jobs/gc.js";
import { diffKeys, exceedsSafetyCap } from "@/jobs/reconcile.js";

const REQUIRED = {
  DATABASE_URL: "postgres://x",
  REDIS_URL: "redis://localhost:6379",
  INTERNAL_SERVICE_SECRET: "0123456789abcdef",
  SITES_BASE_DOMAIN: "useframe.in",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_API_TOKEN: "token",
  SITES_KV_NAMESPACE_ID: "ns",
  SITES_R2_ACCESS_KEY_ID: "key",
  SITES_R2_SECRET_ACCESS_KEY: "secret",
};

describe("env", () => {
  it("refuses DEPLOY_BUILD_ISOLATION=none in production", () => {
    const parsed = parseEnv({ ...REQUIRED, NODE_ENV: "production", DEPLOY_BUILD_ISOLATION: "none" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.DEPLOY_BUILD_ISOLATION?.[0]).toContain("not allowed");
  });

  it("defaults to setpriv, the R2 endpoint, and /work in production", () => {
    const parsed = parseEnv({ ...REQUIRED, NODE_ENV: "production" });
    expect(parsed.ok && parsed.env.DEPLOY_BUILD_ISOLATION).toBe("setpriv");
    expect(parsed.ok && parsed.env.SITES_R2_ENDPOINT).toBe("https://acct.r2.cloudflarestorage.com");
    expect(parsed.ok && parsed.env.DEPLOY_WORK_DIR).toBe("/work");
  });

  it("treats blank optional values from a copied .env.example as unset", () => {
    const parsed = parseEnv({
      ...REQUIRED,
      SITES_R2_ENDPOINT: "",
      DEPLOY_WORK_DIR: "",
      CLOUDFLARE_ZONE_ID: "",
      SITES_EDGE_CNAME_TARGET: "",
      CUSTOM_DOMAIN_BLOCKLIST: "",
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.env.SITES_R2_ENDPOINT).toBe("https://acct.r2.cloudflarestorage.com");
      expect(parsed.env.DEPLOY_WORK_DIR).not.toBe("");
      expect(parsed.env.CLOUDFLARE_ZONE_ID).toBeUndefined();
      expect(parsed.env.SITES_EDGE_CNAME_TARGET).toBe("cname.useframe.in");
      expect(parsed.env.CUSTOM_DOMAIN_BLOCKLIST).toEqual([]);
      expect(parsed.env.CUSTOM_DOMAINS_ENABLED).toBe(false);
    }
  });

  it("names the missing variable without echoing secrets", () => {
    const { CLOUDFLARE_API_TOKEN: _omit, ...rest } = REQUIRED;
    const parsed = parseEnv(rest);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.errors)).toContain("CLOUDFLARE_API_TOKEN");
      expect(JSON.stringify(parsed.errors)).not.toContain("secret");
    }
  });
});

const spec = {
  siteType: "MULTI_PAGE",
  pages: [
    { type: "HOME", slug: "home", title: "Home", sections: [] },
    { type: "ABOUT", slug: "about", title: "About", sections: [] },
  ],
  designSystem: {
    primaryColor: "#000",
    secondaryColor: "#111",
    accentColor: "#222",
    fontPrimary: "Inter",
    fontSecondary: "Inter",
    spacing: "md",
    borderRadius: "md",
    animationStyle: "none",
  },
  copyFramework: "AIDA",
  citations: [],
};

describe("buildable files", () => {
  it("builds a Vite SPA with robots/sitemap on the real site URL", () => {
    const files = filesFromVersion({ snapshot: spec, nextFiles: null }, "https://acme-x7k.useframe.in");
    const robots = files.find((f) => f.path === "public/robots.txt")!.content;
    const sitemap = files.find((f) => f.path === "public/sitemap.xml")!.content;
    expect(robots).toContain("Sitemap: https://acme-x7k.useframe.in/sitemap.xml");
    expect(sitemap).toContain("<loc>https://acme-x7k.useframe.in/about</loc>");
    expect(JSON.stringify(files)).not.toContain("useframe.app");
    expect(detectFramework(files)).toEqual({ framework: "VITE_SPA", outDir: "dist", mode: "s" });
  });

  it("scaffolds a Replicate Next tree as a static export", () => {
    const files = filesFromVersion(
      { snapshot: {}, nextFiles: [{ path: "app/page.tsx", content: "export default () => null" }] },
      "https://x.useframe.in",
    );
    expect(detectFramework(files)).toEqual({ framework: "NEXT_EXPORT", outDir: "out", mode: "n" });
  });

  it("fails clearly for unsupported data", () => {
    expect(() => filesFromVersion({ snapshot: { nope: true }, nextFiles: null }, "https://x")).toThrow(DeployError);
    expect(() =>
      filesFromVersion({ snapshot: {}, nextFiles: [{ path: "../x", content: "" }] }, "https://x"),
    ).toThrow(DeployError);
  });

  it("refuses a Next app that is not static-export-ready instead of patching it", () => {
    const files = [
      { path: "package.json", content: JSON.stringify({ dependencies: { next: "15.0.3" } }) },
      { path: "next.config.js", content: "module.exports = {}" },
    ];
    expect(() => detectFramework(files)).toThrow(/static-export-ready/);
  });

  it("rejects neither-Next-nor-Vite projects", () => {
    expect(() => detectFramework([{ path: "package.json", content: "{}" }])).toThrow(/Unsupported/);
  });

  it("hashes dependency maps independent of key order", () => {
    expect(dependencyHash({ dependencies: { a: "1", b: "2" } })).toBe(
      dependencyHash({ dependencies: { b: "2", a: "1" } }),
    );
    expect(dependencyHash({ dependencies: { a: "1" } })).not.toBe(dependencyHash({ dependencies: { a: "2" } }));
  });

  it("keeps generated paths inside the work dir", () => {
    expect(() => safeJoin("/w/src", "../etc/passwd")).toThrow(DeployError);
    expect(() => safeJoin("/w/src", "/etc/passwd")).toThrow(DeployError);
    expect(() => safeJoin("/w/src", "a//b")).toThrow(DeployError);
  });

  it("never exposes internal error text to users", () => {
    expect(publicReason(new Error("ENOENT /work/abc/src"))).not.toContain("/work");
    expect(publicReason(new DeployError("The site failed to build.", "/work/x"))).toBe("The site failed to build.");
  });
});

describe("upload metadata", () => {
  it.each([
    ["index.html", "text/html; charset=utf-8", "public, max-age=0, must-revalidate"],
    ["about/index.html", "text/html; charset=utf-8", "public, max-age=0, must-revalidate"],
    ["_next/static/chunks/main.js", "javascript", "public, max-age=31536000, immutable"],
    ["assets/index-BxY1.css", "text/css; charset=utf-8", "public, max-age=31536000, immutable"],
    ["img/logo.3f9a8b7c6d.png", "image/png", "public, max-age=31536000, immutable"],
    ["favicon.ico", "image/", "public, max-age=3600"],
    ["robots.txt", "text/plain; charset=utf-8", "public, max-age=3600"],
    ["data.unknownext", "application/octet-stream", "public, max-age=3600"],
  ])("%s", (file, type, cache) => {
    expect(contentTypeFor(file)).toContain(type);
    expect(cacheControlFor(file)).toBe(cache);
  });
});

describe("retention", () => {
  const d = (id: string, status = "SUPERSEDED", storagePrefix: string | null = `sites/p/${id}/`) => ({
    id,
    status,
    storagePrefix,
  });

  it("keeps live, in-flight and the newest N others", () => {
    const list = [d("d9", "BUILDING"), d("d8"), d("d7", "LIVE"), d("d6"), d("d5", "FAILED"), d("d4"), d("d3", "FAILED", null)];
    expect(selectForPurge(list, "d7", 2).map((x) => x.id)).toEqual(["d5", "d4"]);
    expect(selectForPurge(list, "d7", 10)).toEqual([]);
  });
});

describe("reconcile", () => {
  it("diffs key sets", () => {
    const desired = new Map([
      ["h:a", "1"],
      ["h:b", "2"],
    ]);
    expect(diffKeys(desired, ["h:b", "h:c"])).toEqual({ missing: ["h:a"], extra: ["h:c"] });
  });

  it("trips the safety cap above 5% (with a small floor)", () => {
    expect(exceedsSafetyCap(5, 10)).toBe(false);
    expect(exceedsSafetyCap(6, 10)).toBe(true);
    expect(exceedsSafetyCap(50, 1000)).toBe(false);
    expect(exceedsSafetyCap(51, 1000)).toBe(true);
  });
});
