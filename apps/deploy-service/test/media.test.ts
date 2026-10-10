import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { R2 } from "@/lib/r2.js";
import { filesFromVersion, loadVersionMedia, referencedAssetIds } from "@/pipeline/files.js";
import { copyMediaToSite, MissingMediaError, resetMediaCopyStateForTests, type MediaCopyItem } from "@/pipeline/media.js";
import { DeployError } from "@/pipeline/errors.js";

type Store = Map<string, { body: Buffer; contentType?: string; cacheControl?: string }>;

function notFound() {
  return Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
}

// Two buckets behind two tokens; `canCrossCopy` decides whether the sites token
// may read the media bucket (the scoped tokens normally cannot).
function fakeR2(buckets: Record<string, Store>, opts: { canCrossCopy?: boolean; failGets?: number } = {}) {
  const calls: string[] = [];
  let failGets = opts.failGets ?? 0;
  const make = (bucket: string): R2 => ({
    bucket,
    client: {
      send: vi.fn(async (cmd: unknown) => {
        if (cmd instanceof CopyObjectCommand) {
          calls.push("copy");
          if (!opts.canCrossCopy) throw Object.assign(new Error("AccessDenied"), { name: "AccessDenied", $metadata: { httpStatusCode: 403 } });
          const [srcBucket, ...rest] = cmd.input.CopySource!.split("/");
          const src = buckets[srcBucket!]!.get(rest.map(decodeURIComponent).join("/"));
          if (!src) throw notFound();
          buckets[bucket]!.set(cmd.input.Key!, { body: src.body, contentType: cmd.input.ContentType, cacheControl: cmd.input.CacheControl });
          return {};
        }
        if (cmd instanceof HeadObjectCommand) {
          calls.push("head");
          if (!buckets[bucket]!.has(cmd.input.Key!)) throw notFound();
          return {};
        }
        if (cmd instanceof GetObjectCommand) {
          calls.push("get");
          if (failGets > 0) {
            failGets--;
            throw Object.assign(new Error("Service Unavailable"), { $metadata: { httpStatusCode: 503 } });
          }
          const obj = buckets[bucket]!.get(cmd.input.Key!);
          if (!obj) throw notFound();
          return { Body: Readable.from([obj.body]) };
        }
        if (cmd instanceof PutObjectCommand) {
          calls.push("put");
          const chunks: Buffer[] = [];
          for await (const c of cmd.input.Body as Readable) chunks.push(Buffer.from(c as Uint8Array));
          buckets[bucket]!.set(cmd.input.Key!, { body: Buffer.concat(chunks), contentType: cmd.input.ContentType, cacheControl: cmd.input.CacheControl });
          return {};
        }
        throw new Error("unexpected command");
      }),
    } as unknown as R2["client"],
  });
  return { media: make("useframe-media"), sites: make("useframe-sites"), calls };
}

const item = (id: string, overrides: Partial<MediaCopyItem> = {}): MediaCopyItem => ({
  assetId: id,
  title: `Photo ${id}`,
  sourceKey: `media/p1/${id}/v/w960.webp`,
  destRelPath: `media/${id}/w960.abcdef12.webp`,
  bytes: 5,
  mime: "image/webp",
  ...overrides,
});

let buckets: Record<string, Store>;

beforeEach(() => {
  resetMediaCopyStateForTests();
  buckets = { "useframe-media": new Map(), "useframe-sites": new Map() };
  for (const id of ["a1", "a2", "a3"]) buckets["useframe-media"]!.set(`media/p1/${id}/v/w960.webp`, { body: Buffer.from(id) });
});

describe("copyMediaToSite", () => {
  it("uses CopyObject when the token allows it, with immutable caching", async () => {
    const r2 = fakeR2(buckets, { canCrossCopy: true });
    const bytes = await copyMediaToSite(r2.media, r2.sites, "sites/p1/d1/", [item("a1"), item("a2")]);
    expect(bytes).toBe(10);
    expect(buckets["useframe-sites"]!.get("sites/p1/d1/media/a1/w960.abcdef12.webp")).toMatchObject({
      body: Buffer.from("a1"),
      contentType: "image/webp",
      cacheControl: "public, max-age=31536000, immutable",
    });
    expect(r2.calls.filter((c) => c === "get")).toHaveLength(0);
  });

  it("falls back to a streamed GET→PUT once CopyObject is refused, and stays on it", async () => {
    const r2 = fakeR2(buckets, { canCrossCopy: false });
    await copyMediaToSite(r2.media, r2.sites, "sites/p1/d1/", [item("a1")]);
    await copyMediaToSite(r2.media, r2.sites, "sites/p1/d2/", [item("a2"), item("a3")]);
    expect(r2.calls.filter((c) => c === "copy")).toHaveLength(1);
    expect(buckets["useframe-sites"]!.get("sites/p1/d2/media/a3/w960.abcdef12.webp")?.body).toEqual(Buffer.from("a3"));
    expect([...buckets["useframe-sites"]!.keys()]).toHaveLength(3);
  });

  it("fails closed, naming the asset title, when a referenced variant is missing", async () => {
    for (const canCrossCopy of [true, false]) {
      resetMediaCopyStateForTests();
      const r2 = fakeR2(buckets, { canCrossCopy });
      const err = await copyMediaToSite(r2.media, r2.sites, "sites/p1/d1/", [item("a1"), item("gone", { title: "Team photo" })]).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(MissingMediaError);
      expect((err as DeployError).publicMessage).toContain('"Team photo"');
      expect((err as DeployError).publicMessage).not.toContain("media/p1");
    }
  });

  it("retries transient source errors", async () => {
    const r2 = fakeR2(buckets, { canCrossCopy: false, failGets: 1 });
    await copyMediaToSite(r2.media, r2.sites, "sites/p1/d1/", [item("a1")]);
    expect(buckets["useframe-sites"]!.has("sites/p1/d1/media/a1/w960.abcdef12.webp")).toBe(true);
  });

  it("refuses to deploy media without a configured source and is a no-op without media", async () => {
    const r2 = fakeR2(buckets);
    await expect(copyMediaToSite(null, r2.sites, "sites/p1/d1/", [item("a1")])).rejects.toBeInstanceOf(DeployError);
    expect(await copyMediaToSite(null, r2.sites, "sites/p1/d1/", [])).toBe(0);
  });
});

describe("version media manifest", () => {
  const sha = (c: string) => c.repeat(64);
  const spec = {
    siteType: "SINGLE_PAGE",
    copyFramework: "AIDA",
    citations: [],
    designSystem: { primaryColor: "#000000", secondaryColor: "#000000", accentColor: "#000000", fontPrimary: "Inter", fontSecondary: "Inter", spacing: "", borderRadius: "md", animationStyle: "" },
    pages: [{ type: "HOME", slug: "home", title: "Home", sections: [{ type: "HERO", index: 0, content: { headline: "Hi" } }] }],
    media: { "home/hero-0/visual": { assetId: "img1" }, "home/hero-0/background": { assetId: "purged" } },
  };

  it("lists only the variants the export markup uses, with their library keys", async () => {
    const db = {
      mediaAsset: {
        findMany: vi.fn(async () => [
          {
            id: "img1",
            kind: "IMAGE",
            origin: "UPLOADED",
            status: "READY",
            deletedAt: null,
            title: "Studio",
            width: 1920,
            height: 1080,
            durationMs: null,
            dominantColor: null,
            lqip: null,
            altText: "Studio",
            decorative: false,
            variants: [
              { role: "w960", key: "media/p1/img1/v/w960.webp", mime: "image/webp", width: 960, height: 540, bytes: 100, sha256: sha("a") },
              { role: "fallback", key: "media/p1/img1/v/fallback.jpg", mime: "image/jpeg", width: 1600, height: 900, bytes: 200, sha256: sha("b") },
              { role: "thumb", key: "media/p1/img1/v/thumb.webp", mime: "image/webp", width: 320, height: 180, bytes: 10, sha256: sha("c") },
            ],
          },
        ]),
      },
    };
    expect(referencedAssetIds(spec)).toEqual(["img1", "purged"]);
    const media = await loadVersionMedia(db as never, "p1", referencedAssetIds(spec));
    expect(db.mediaAsset.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["img1", "purged"] }, projectId: "p1" } }));
    const built = filesFromVersion({ snapshot: spec, nextFiles: null }, "https://acme.useframe.in", media);
    expect(built.media).toEqual([
      { assetId: "img1", title: "Studio", sourceKey: "media/p1/img1/v/w960.webp", destRelPath: "media/img1/w960.aaaaaaaa.webp", bytes: 100, mime: "image/webp" },
      { assetId: "img1", title: "Studio", sourceKey: "media/p1/img1/v/fallback.jpg", destRelPath: "media/img1/fallback.bbbbbbbb.jpg", bytes: 200, mime: "image/jpeg" },
    ]);
    expect(built.mediaWarnings).toEqual(["home/hero-0/background: media dropped (asset not found)"]);
    expect(built.files.find((f) => f.path === "src/App.jsx")!.content).toContain('"/media/img1/fallback.bbbbbbbb.jpg"');
  });
});
