import { describe, expect, it } from "vitest";
import type { ResolvedMediaAsset, SectionType, SiteSpec } from "@repo/schemas";
import { buildSite } from "./index.js";
import {
  checkBinding,
  listMediaSlots,
  resolveMediaUrl,
  SECTION_MEDIA_SLOTS,
  slotsForSection,
  validateMediaBindings,
  type MediaSlotDef,
} from "./media.js";

const sha = (c: string) => c.repeat(64);

function image(id: string, overrides: Partial<ResolvedMediaAsset> = {}): ResolvedMediaAsset {
  return {
    id,
    kind: "IMAGE",
    origin: "UPLOADED",
    status: "READY",
    deleted: false,
    title: "Office",
    width: 1920,
    height: 1080,
    durationMs: null,
    dominantColor: "#334455",
    lqip: null,
    altText: "A bright office",
    decorative: false,
    variants: [
      { role: "w480", mime: "image/webp", width: 480, height: 270, bytes: 20_000, sha256: sha("a"), url: `https://api.test/media/${id}/w480?sig=1` },
      { role: "w960", mime: "image/webp", width: 960, height: 540, bytes: 60_000, sha256: sha("b"), url: `https://api.test/media/${id}/w960?sig=1` },
      { role: "w1600", mime: "image/webp", width: 1600, height: 900, bytes: 150_000, sha256: sha("c"), url: `https://api.test/media/${id}/w1600?sig=1` },
      { role: "fallback", mime: "image/jpeg", width: 1600, height: 900, bytes: 200_000, sha256: sha("d"), url: `https://api.test/media/${id}/fallback?sig=1` },
      { role: "thumb", mime: "image/webp", width: 320, height: 180, bytes: 9_000, sha256: sha("e") },
    ],
    ...overrides,
  };
}

function video(id: string, overrides: Partial<ResolvedMediaAsset> = {}): ResolvedMediaAsset {
  return {
    ...image(id),
    kind: "VIDEO",
    durationMs: 12_000,
    variants: [
      { role: "mp4_720", mime: "video/mp4", width: 1280, height: 720, bytes: 3_000_000, sha256: sha("1"), url: `https://api.test/media/${id}/mp4_720?sig=1` },
      { role: "mp4_1080", mime: "video/mp4", width: 1920, height: 1080, bytes: 6_000_000, sha256: sha("2"), url: `https://api.test/media/${id}/mp4_1080?sig=1` },
      { role: "poster", mime: "image/webp", width: 1920, height: 1080, bytes: 80_000, sha256: sha("3"), url: `https://api.test/media/${id}/poster?sig=1` },
      { role: "poster_last", mime: "image/webp", width: 1920, height: 1080, bytes: 80_000, sha256: sha("4") },
    ],
    ...overrides,
  };
}

function specWith(sections: { type: SectionType; items?: number }[], media: SiteSpec["media"] = {}): SiteSpec {
  return {
    siteType: "SINGLE_PAGE",
    copyFramework: "AIDA",
    citations: [],
    designSystem: {
      primaryColor: "#2563EB",
      secondaryColor: "#F1F5F9",
      accentColor: "#F97316",
      fontPrimary: "Inter",
      fontSecondary: "Inter",
      spacing: "comfortable",
      borderRadius: "md",
      animationStyle: "subtle",
    },
    pages: [
      {
        type: "HOME",
        slug: "home",
        title: "Home",
        sections: sections.map((s, index) => ({
          type: s.type,
          index,
          content: {
            headline: `${s.type} headline`,
            body: "Body",
            cta: { primary: "Go", primaryHref: "/start" },
            items: Array.from({ length: s.items ?? 0 }, (_, i) => ({ title: `Item ${i}`, description: "Desc" })),
          },
        })),
      },
    ],
    media,
  };
}

const app = (spec: SiteSpec, assets: ResolvedMediaAsset[], target: "preview" | "export" = "preview") => {
  const built = buildSite(spec, undefined, { media: { target, assets } });
  return { ...built, app: built.files.find((f) => f.path === "src/App.jsx")!.content };
};

describe("media slots", () => {
  it("expands item slots per content item and builds slot ids", () => {
    const spec = specWith([{ type: "HERO" }, { type: "FEATURES", items: 3 }]);
    const ids = listMediaSlots(spec).map((r) => r.slotId);
    expect(ids).toEqual([
      "home/hero-0/background",
      "home/hero-0/visual",
      "home/features-1/item-0",
      "home/features-1/item-1",
      "home/features-1/item-2",
    ]);
  });

  it("lets video into every video-capable slot, not just the hero", () => {
    const videoSlots = Object.entries(SECTION_MEDIA_SLOTS).flatMap(([type, def]) =>
      [...(def.slots ?? []), ...(def.itemSlot ? [{ ...def.itemSlot, key: "item" }] : [])]
        .filter((s) => s.kinds.includes("video"))
        .map(() => type),
    );
    expect(new Set(videoSlots)).toEqual(new Set(["HERO", "FEATURES", "HOW_IT_WORKS", "CTA", "CUSTOM"]));
  });

  it("rejects wrong kind, wrong aspect, not-ready, deleted and generated media for upload-only slots", () => {
    const avatar = slotsForSection({ type: "TESTIMONIALS", content: { items: [{ title: "a", description: "b" }] } })[0]!;
    const heroVisual = SECTION_MEDIA_SLOTS.HERO!.slots!.find((s) => s.key === "visual") as MediaSlotDef;
    const square = { ...image("sq"), width: 800, height: 800 };
    expect(checkBinding(avatar, square)).toBeNull();
    expect(checkBinding(avatar, video("v"))).toBe("slot does not accept video");
    expect(checkBinding(heroVisual, square)).toBe("aspect does not fit 16:9");
    expect(checkBinding(heroVisual, { ...image("p"), status: "PROCESSING" })).toBe("asset is not ready");
    expect(checkBinding(heroVisual, { ...image("d"), deleted: true })).toBe("asset not found");
    expect(checkBinding(avatar, { ...square, origin: "GENERATED" })).toBe("slot accepts uploaded media only");
    expect(checkBinding(heroVisual, { ...image("g"), origin: "GENERATED" })).toBeNull();
  });

  it("validates bindings against the spec's slots and the asset map", () => {
    const spec = specWith([{ type: "HERO" }], {
      "home/hero-0/visual": { assetId: "img1" },
      "home/hero-0/nope": { assetId: "img1" },
      "home/hero-0/background": { assetId: "missing" },
    });
    const { valid, rejected } = validateMediaBindings(spec, new Map([["img1", image("img1")]]));
    expect(Object.keys(valid)).toEqual(["home/hero-0/visual"]);
    expect(rejected.map((r) => r.reason).sort()).toEqual(["asset not found", "unknown slot"]);
  });
});

describe("resolveMediaUrl", () => {
  it("uses the signed URL for preview and a hashed relative path for export", () => {
    const asset = image("img1");
    expect(resolveMediaUrl(asset, "w960", "preview")).toBe("https://api.test/media/img1/w960?sig=1");
    expect(resolveMediaUrl(asset, "w960", "export")).toBe("/media/img1/w960.bbbbbbbb.webp");
    expect(resolveMediaUrl(asset, "fallback", "export")).toBe("/media/img1/fallback.dddddddd.jpg");
    expect(resolveMediaUrl(asset, "w2400", "export")).toBeNull();
  });

  it("refuses non-https preview URLs", () => {
    const asset = image("img1");
    asset.variants[1]!.url = "javascript:alert(1)";
    expect(resolveMediaUrl(asset, "w960", "preview")).toBeNull();
  });
});

describe("rendering", () => {
  it("renders a responsive, eager hero <picture> with explicit dimensions", () => {
    const { app: out } = app(specWith([{ type: "HERO" }], { "home/hero-0/visual": { assetId: "img1" } }), [image("img1")]);
    const picture = out.match(/<picture>.*?<\/picture>/s)![0];
    expect(picture).toMatchSnapshot();
    expect(picture).toContain(`fetchpriority="high"`);
    expect(picture).toContain(`loading="eager"`);
    expect(picture).toContain(`sizes={"(min-width: 1024px) 960px, 100vw"}`);
  });

  it("lazy-loads below-the-fold images and hides decorative ones", () => {
    const spec = specWith([{ type: "FEATURES", items: 1 }], { "home/features-0/item-0": { assetId: "img1" } });
    const { app: out } = app(spec, [{ ...image("img1", { width: 1200, height: 900 }), decorative: true }]);
    expect(out).toContain(`loading="lazy"`);
    expect(out).not.toContain("fetchpriority");
    expect(out).toContain(`alt={""} aria-hidden="true"`);
  });

  it("renders a muted background video started by the playback script", () => {
    const { app: out, files } = app(specWith([{ type: "HERO" }], { "home/hero-0/background": { assetId: "v1", loop: true } }), [
      video("v1"),
    ]);
    const tag = out.match(/<video.*?<\/video>/s)![0];
    expect(tag).toMatchSnapshot();
    expect(tag).toContain(`muted playsInline preload="metadata"`);
    expect(tag).toContain(" loop ");
    expect(tag).toContain(`aria-hidden="true"`);
    expect(tag).not.toMatch(/autoPlay|autoplay/);
    expect(tag).toContain(`media="(max-width: 767px)"`);
    expect(out).toContain("rgba(0,0,0,0.6)");
    const script = files.find((f) => f.path === "src/mediaPlayback.js")!.content;
    expect(script).toContain("prefers-reduced-motion: reduce");
    expect(script).toContain("saveData");
    expect(script).toContain("IntersectionObserver");
    expect(files.find((f) => f.path === "src/main.jsx")!.content).toContain(`import "./mediaPlayback.js"`);
  });

  it("renders an inline step clip that plays in view, once, with an accessible label", () => {
    const spec = specWith([{ type: "HOW_IT_WORKS", items: 2 }], { "home/how_it_works-0/item-1": { assetId: "v1" } });
    const { app: out } = app(spec, [video("v1")]);
    const tag = out.match(/<video.*?<\/video>/s)![0];
    expect(tag).toMatchSnapshot();
    expect(tag).toContain(`data-uf-play={"in_view"}`);
    expect(tag).toContain(`aria-label={"A bright office"}`);
    expect(tag).not.toContain(" loop ");
    expect(out).toContain("Item 0");
  });

  it("renders a player with controls and no preload", () => {
    const playerSlot: MediaSlotDef = { key: "showcase", purpose: "section_video", kinds: ["video"], display: "player", priority: "normal" };
    const original = SECTION_MEDIA_SLOTS.CUSTOM!.slots;
    SECTION_MEDIA_SLOTS.CUSTOM!.slots = [playerSlot];
    try {
      const { app: out } = app(specWith([{ type: "CUSTOM" }], { "home/custom-0/showcase": { assetId: "v1" } }), [video("v1")]);
      const tag = out.match(/<video.*?<\/video>/s)![0];
      expect(tag).toMatchSnapshot();
      expect(tag).toContain(`controls preload="none"`);
      expect(tag).not.toContain("data-uf-play");
    } finally {
      SECTION_MEDIA_SLOTS.CUSTOM!.slots = original;
    }
  });

  it("emits no media markup or playback script without bindings", () => {
    const built = buildSite(specWith([{ type: "HERO" }, { type: "CTA" }]));
    const out = built.files.find((f) => f.path === "src/App.jsx")!.content;
    expect(out).not.toMatch(/<picture|<video/);
    expect(built.files.some((f) => f.path === "src/mediaPlayback.js")).toBe(false);
    expect(built.mediaWarnings).toEqual([]);
  });

  it.each(Object.keys(SECTION_MEDIA_SLOTS) as SectionType[])(
    "%s still renders when its bindings are missing, deleted or the wrong kind",
    (type) => {
      const spec = specWith([{ type, items: 2 }]);
      const media: NonNullable<SiteSpec["media"]> = {};
      const refs = listMediaSlots(spec);
      refs.forEach((ref, i) => {
        const unusable = ref.slot.kinds.includes("video") ? "notready" : "wrongkind";
        media[ref.slotId] = { assetId: ["missing", "deleted", unusable][i % 3]! };
      });
      spec.media = media;
      const assets = [
        image("deleted", { deleted: true }),
        video("wrongkind"),
        image("notready", { status: "PROCESSING" }),
      ];
      const { app: out, mediaWarnings } = app(spec, assets);
      expect(out).toContain(`${type} headline`);
      expect(out).not.toMatch(/<picture|<video/);
      expect(mediaWarnings.length).toBe(refs.length);
      for (const w of mediaWarnings) expect(w).toMatch(/media dropped/);
    },
  );
});

describe("export", () => {
  it("references hashed relative paths and lists exactly the variants it used", () => {
    const spec = specWith([{ type: "HERO" }], {
      "home/hero-0/visual": { assetId: "img1" },
      "home/hero-0/background": { assetId: "v1" },
    });
    const { app: out, mediaFiles } = app(spec, [image("img1"), video("v1")], "export");
    expect(out).toContain("/media/img1/w960.bbbbbbbb.webp 960w");
    expect(out).not.toContain("https://api.test");
    expect(mediaFiles.map((f) => f.path).sort()).toEqual([
      "media/img1/fallback.dddddddd.jpg",
      "media/img1/w1600.cccccccc.webp",
      "media/img1/w480.aaaaaaaa.webp",
      "media/img1/w960.bbbbbbbb.webp",
      "media/v1/mp4_1080.22222222.mp4",
      "media/v1/mp4_720.11111111.mp4",
      "media/v1/poster.33333333.webp",
    ]);
  });
});

describe("performance warnings", () => {
  it("warns on a heavy hero image, a heavy background video and too many autoplaying videos", () => {
    const heavy = image("img1");
    heavy.variants.find((v) => v.role === "w1600")!.bytes = 500 * 1024;
    const bigVideo = video("v1");
    bigVideo.variants.find((v) => v.role === "mp4_720")!.bytes = 9 * 1024 * 1024;
    const spec = specWith([{ type: "HERO" }, { type: "FEATURES", items: 4 }], {
      "home/hero-0/visual": { assetId: "img1" },
      "home/hero-0/background": { assetId: "v1" },
      "home/features-1/item-0": { assetId: "v2" },
      "home/features-1/item-1": { assetId: "v2" },
      "home/features-1/item-2": { assetId: "v2" },
    });
    const v2 = video("v2", { width: 1200, height: 900 });
    const { mediaWarnings } = app(spec, [heavy, bigVideo, v2]);
    expect(mediaWarnings).toEqual(
      expect.arrayContaining([
        "home/hero-0/visual: hero image is larger than 400 KB",
        "home/hero-0/background: background video is larger than 8 MB",
        "home: more than 3 autoplaying videos on one page",
      ]),
    );
  });
});
