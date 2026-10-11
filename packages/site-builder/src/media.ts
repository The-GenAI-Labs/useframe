import {
  GENERATABLE_PURPOSES,
  MEDIA_PURPOSES,
  type MediaBinding,
  type MediaPurpose,
  type MediaVariantRole,
  type ResolvedMediaAsset,
  type ResolvedMediaVariant,
  type Section,
  type SectionType,
  type SiteSpec,
} from "@repo/schemas";

export { GENERATABLE_PURPOSES, MEDIA_PURPOSES, type MediaPurpose };

export type MediaAspect = "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9";
export type MediaTarget = "preview" | "export";

export interface MediaSlotDef {
  key: string;
  purpose: MediaPurpose;
  kinds: ("image" | "video")[];
  aspect?: MediaAspect;
  display: "background" | "inline" | "player";
  priority: "hero" | "above_fold" | "normal";
  sizes?: string;
  defaultOverlay?: "none" | "light" | "dark";
}

export type SectionMediaSlots = {
  slots?: MediaSlotDef[];
  // Expanded once per content item as `item-{n}` (feature tiles, steps, people).
  itemSlot?: Omit<MediaSlotDef, "key">;
};

const MAX_ITEM_SLOTS = 8;

const ITEM_SIZES = "(min-width: 1100px) 340px, (min-width: 640px) 50vw, 100vw";

export const SECTION_MEDIA_SLOTS: Partial<Record<SectionType, SectionMediaSlots>> = {
  HEADER: {
    slots: [
      { key: "logo", purpose: "logo", kinds: ["image"], display: "inline", priority: "above_fold", sizes: "160px" },
    ],
  },
  HERO: {
    slots: [
      {
        key: "background",
        purpose: "background",
        kinds: ["image", "video"],
        display: "background",
        priority: "hero",
        sizes: "100vw",
        defaultOverlay: "dark",
      },
      {
        key: "visual",
        purpose: "hero_visual",
        kinds: ["image", "video"],
        aspect: "16:9",
        display: "inline",
        priority: "hero",
        sizes: "(min-width: 1024px) 960px, 100vw",
      },
    ],
  },
  FEATURES: {
    itemSlot: {
      purpose: "feature_visual",
      kinds: ["image", "video"],
      aspect: "4:3",
      display: "inline",
      priority: "normal",
      sizes: ITEM_SIZES,
    },
  },
  HOW_IT_WORKS: {
    itemSlot: {
      purpose: "section_video",
      kinds: ["image", "video"],
      aspect: "16:9",
      display: "inline",
      priority: "normal",
      sizes: ITEM_SIZES,
    },
  },
  TESTIMONIALS: {
    itemSlot: { purpose: "avatar", kinds: ["image"], aspect: "1:1", display: "inline", priority: "normal", sizes: "64px" },
  },
  TEAM: {
    itemSlot: { purpose: "team_photo", kinds: ["image"], aspect: "1:1", display: "inline", priority: "normal", sizes: ITEM_SIZES },
  },
  CTA: {
    slots: [
      {
        key: "background",
        purpose: "cta_background",
        kinds: ["image", "video"],
        display: "background",
        priority: "normal",
        sizes: "100vw",
        defaultOverlay: "light",
      },
    ],
  },
  CUSTOM: {
    slots: [
      {
        key: "showcase",
        purpose: "section_illustration",
        kinds: ["image", "video"],
        aspect: "16:9",
        display: "inline",
        priority: "normal",
        sizes: "(min-width: 1024px) 960px, 100vw",
      },
      {
        key: "background",
        purpose: "background",
        kinds: ["image", "video"],
        display: "background",
        priority: "normal",
        sizes: "100vw",
        defaultOverlay: "dark",
      },
    ],
  },
};

export function sectionIdOf(section: Pick<Section, "type" | "index">): string {
  return `${section.type.toLowerCase()}-${section.index}`;
}

export function slotIdOf(pageSlug: string, section: Pick<Section, "type" | "index">, slotKey: string): string {
  return `${pageSlug}/${sectionIdOf(section)}/${slotKey}`;
}

export function slotsForSection(section: Pick<Section, "type" | "content">): MediaSlotDef[] {
  const def = SECTION_MEDIA_SLOTS[section.type];
  if (!def) return [];
  const slots = [...(def.slots ?? [])];
  if (def.itemSlot) {
    const count = Math.min(section.content?.items?.length ?? 0, MAX_ITEM_SLOTS);
    for (let i = 0; i < count; i++) slots.push({ ...def.itemSlot, key: `item-${i}` });
  }
  return slots;
}

export type SlotRef = { slotId: string; pageSlug: string; section: Section; slot: MediaSlotDef };

export function listMediaSlots(spec: Pick<SiteSpec, "pages">): SlotRef[] {
  const refs: SlotRef[] = [];
  for (const page of spec.pages) {
    for (const section of page.sections) {
      for (const slot of slotsForSection(section)) {
        refs.push({ slotId: slotIdOf(page.slug, section, slot.key), pageSlug: page.slug, section, slot });
      }
    }
  }
  return refs;
}

export function isUploadOnlyPurpose(purpose: MediaPurpose): boolean {
  return !(GENERATABLE_PURPOSES as readonly string[]).includes(purpose);
}

const ASPECT_RATIOS: Record<MediaAspect, number> = {
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
  "3:4": 3 / 4,
  "9:16": 9 / 16,
  "21:9": 21 / 9,
};

// object-fit: cover absorbs moderate crops; anything beyond ~1.4x would cut the subject.
const ASPECT_TOLERANCE = Math.log(1.4);

export function aspectFits(slot: MediaSlotDef, width: number | null, height: number | null): boolean {
  if (!slot.aspect || slot.display === "background") return true;
  if (!width || !height) return false;
  return Math.abs(Math.log(width / height / ASPECT_RATIOS[slot.aspect])) <= ASPECT_TOLERANCE;
}

export function nearestAspect(width: number | null, height: number | null): MediaAspect | null {
  if (!width || !height) return null;
  let best: MediaAspect = "16:9";
  let bestDiff = Infinity;
  for (const [aspect, ratio] of Object.entries(ASPECT_RATIOS) as [MediaAspect, number][]) {
    const diff = Math.abs(Math.log(width / height / ratio));
    if (diff < bestDiff) {
      best = aspect;
      bestDiff = diff;
    }
  }
  return best;
}

// What the binding rules need; resolved assets and menu entries both satisfy it.
export type BindableAsset = {
  id: string;
  kind: "IMAGE" | "VIDEO";
  origin: "UPLOADED" | "GENERATED";
  status: string;
  deleted: boolean;
  width: number | null;
  height: number | null;
};

export type RejectedBinding = { slotId: string; assetId: string; reason: string };

export function checkBinding(slot: MediaSlotDef, asset: BindableAsset | undefined): string | null {
  if (!asset || asset.deleted) return "asset not found";
  if (asset.status !== "READY") return "asset is not ready";
  const kind = asset.kind === "VIDEO" ? "video" : "image";
  if (!slot.kinds.includes(kind)) return `slot does not accept ${kind}`;
  if (!aspectFits(slot, asset.width, asset.height)) return `aspect does not fit ${slot.aspect}`;
  if (isUploadOnlyPurpose(slot.purpose) && asset.origin !== "UPLOADED") return "slot accepts uploaded media only";
  return null;
}

export function validateMediaBindings(
  spec: Pick<SiteSpec, "pages" | "media">,
  assets: ReadonlyMap<string, BindableAsset>,
): { valid: Record<string, MediaBinding>; rejected: RejectedBinding[] } {
  const slots = new Map(listMediaSlots(spec).map((ref) => [ref.slotId, ref.slot]));
  const valid: Record<string, MediaBinding> = {};
  const rejected: RejectedBinding[] = [];
  for (const [slotId, binding] of Object.entries(spec.media ?? {})) {
    const slot = slots.get(slotId);
    const reason = slot ? checkBinding(slot, assets.get(binding.assetId)) : "unknown slot";
    if (reason) rejected.push({ slotId, assetId: binding.assetId, reason });
    else valid[slotId] = binding;
  }
  return { valid, rejected };
}

const EXT_BY_MIME: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
  "video/mp4": "mp4",
};

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? "bin";
}

// Hashed, so deployed media files are immutable and cacheable forever.
export function exportMediaPath(assetId: string, role: MediaVariantRole, sha256: string, mime: string): string {
  return `/media/${assetId}/${role}.${sha256.slice(0, 8)}.${extForMime(mime)}`;
}

function isSafeMediaUrl(url: string): boolean {
  return /^https:\/\/[^\s"'<>]+$/i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s"'<>]*$/i.test(url);
}

export function resolveMediaUrl(
  asset: Pick<ResolvedMediaAsset, "id" | "variants">,
  role: MediaVariantRole,
  target: MediaTarget,
): string | null {
  const variant = asset.variants.find((v) => v.role === role);
  if (!variant) return null;
  if (target === "export") return exportMediaPath(asset.id, role, variant.sha256, variant.mime);
  return variant.url && isSafeMediaUrl(variant.url) ? variant.url : null;
}

export type MediaFileRef = { assetId: string; role: MediaVariantRole; path: string; bytes: number };

export type MediaRenderContext = {
  target: MediaTarget;
  bindings: Record<string, MediaBinding>;
  assets: ReadonlyMap<string, ResolvedMediaAsset>;
  warnings: string[];
  files: Map<string, MediaFileRef>;
  autoplayCount: number;
};

const HERO_IMAGE_WARN_BYTES = 400 * 1024;
const BACKGROUND_VIDEO_WARN_BYTES = 8 * 1024 * 1024;
const IMAGE_WIDTH_ROLES: MediaVariantRole[] = ["w480", "w960", "w1600", "w2400"];

const js = (value: unknown) => `{${JSON.stringify(value)}}`;

function takeVariant(ctx: MediaRenderContext, asset: ResolvedMediaAsset, role: MediaVariantRole): string | null {
  const url = resolveMediaUrl(asset, role, ctx.target);
  if (!url) return null;
  const variant = asset.variants.find((v) => v.role === role)!;
  if (ctx.target === "export") ctx.files.set(url, { assetId: asset.id, role, path: url.slice(1), bytes: variant.bytes });
  return url;
}

function altFor(asset: ResolvedMediaAsset, binding: MediaBinding): string {
  return (binding.alt ?? asset.altText ?? asset.title ?? "").slice(0, 200);
}

const OVERLAYS = {
  light: "linear-gradient(rgba(255,255,255,0.78), rgba(255,255,255,0.62))",
  dark: "linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.45))",
} as const;

function boxStyle(slot: MediaSlotDef, asset: ResolvedMediaAsset, binding: MediaBinding): Record<string, string | number> {
  const style: Record<string, string | number> = {
    display: "block",
    width: "100%",
    objectFit: "cover",
    objectPosition: binding.objectPosition ?? "center",
  };
  if (asset.dominantColor && /^#[0-9a-f]{6}$/i.test(asset.dominantColor)) style.backgroundColor = asset.dominantColor;
  if (slot.display === "background") {
    Object.assign(style, { position: "absolute", inset: 0, height: "100%", zIndex: 0 });
  } else {
    style.height = "auto";
    style.borderRadius = slot.purpose === "avatar" ? "9999px" : "var(--radius)";
    if (slot.aspect) style.aspectRatio = slot.aspect.replace(":", " / ");
    if (slot.purpose === "logo") Object.assign(style, { width: "auto", maxHeight: "48px", objectFit: "contain" });
    if (slot.purpose === "avatar") Object.assign(style, { width: "64px", height: "64px" });
  }
  return style;
}

function renderImage(
  ctx: MediaRenderContext,
  slotId: string,
  slot: MediaSlotDef,
  asset: ResolvedMediaAsset,
  binding: MediaBinding,
): string | null {
  const widths = IMAGE_WIDTH_ROLES.flatMap((role) => {
    const variant = asset.variants.find((v) => v.role === role);
    const url = variant ? takeVariant(ctx, asset, role) : null;
    return url && variant?.width ? [`${url} ${variant.width}w`] : [];
  });
  const fallbackVariant = asset.variants.find((v) => v.role === "fallback");
  const fallback = takeVariant(ctx, asset, "fallback");
  if (!fallback || !fallbackVariant) return null;

  if (slot.priority === "hero") {
    const heroVariant =
      asset.variants.find((v) => v.role === "w1600") ?? asset.variants.find((v) => v.role === "fallback");
    if (heroVariant && heroVariant.bytes > HERO_IMAGE_WARN_BYTES) {
      ctx.warnings.push(`${slotId}: hero image is larger than 400 KB`);
    }
  }

  const decorative = asset.decorative || slot.display === "background";
  const eager = slot.priority === "hero" || slot.priority === "above_fold";
  const imgAttrs = [
    `src=${js(fallback)}`,
    `width=${js(fallbackVariant.width ?? asset.width ?? undefined)}`,
    `height=${js(fallbackVariant.height ?? asset.height ?? undefined)}`,
    `alt=${js(decorative ? "" : altFor(asset, binding))}`,
    decorative ? `aria-hidden="true"` : "",
    `decoding="async"`,
    eager ? `loading="eager"` : `loading="lazy"`,
    slot.priority === "hero" ? `fetchpriority="high"` : "",
    `style={${JSON.stringify(boxStyle(slot, asset, binding))}}`,
  ].filter(Boolean);
  const source = widths.length
    ? `<source type="image/webp" srcSet=${js(widths.join(", "))} sizes=${js(slot.sizes ?? "100vw")} />`
    : "";
  return `<picture>${source}<img ${imgAttrs.join(" ")} /></picture>`;
}

function renderVideo(
  ctx: MediaRenderContext,
  slotId: string,
  slot: MediaSlotDef,
  asset: ResolvedMediaAsset,
  binding: MediaBinding,
): string | null {
  const v720 = asset.variants.find((v) => v.role === "mp4_720");
  const src720 = takeVariant(ctx, asset, "mp4_720");
  if (!src720 || !v720) return null;
  const src1080 = asset.variants.some((v) => v.role === "mp4_1080") ? takeVariant(ctx, asset, "mp4_1080") : null;
  const poster = takeVariant(ctx, asset, "poster");
  const sources = src1080
    ? `<source src=${js(src720)} type="video/mp4" media="(max-width: 767px)" /><source src=${js(src1080)} type="video/mp4" />`
    : `<source src=${js(src720)} type="video/mp4" />`;
  const style = `style={${JSON.stringify(boxStyle(slot, asset, binding))}}`;
  const label = altFor(asset, binding);

  if (slot.display === "player") {
    return `<video controls preload="none" playsInline${poster ? ` poster=${js(poster)}` : ""} title=${js(label)} aria-label=${js(label)} ${style}>${sources}</video>`;
  }

  if (slot.display === "background" && v720.bytes > BACKGROUND_VIDEO_WARN_BYTES) {
    ctx.warnings.push(`${slotId}: background video is larger than 8 MB`);
  }
  ctx.autoplayCount++;
  const hidden = slot.display === "background" || asset.decorative;
  const playWhen = slot.display === "background" ? "load" : (binding.playWhen ?? "in_view");
  // Started by mediaPlayback.js, not autoplay, so reduced motion and Save-Data win.
  const attrs = [
    "muted",
    "playsInline",
    `preload="metadata"`,
    poster ? `poster=${js(poster)}` : "",
    binding.loop ? "loop" : "",
    `data-uf-play=${js(playWhen)}`,
    hidden ? `aria-hidden="true"` : `title=${js(label)} aria-label=${js(label)}`,
    style,
  ].filter(Boolean);
  return `<video ${attrs.join(" ")}>${sources}</video>`;
}

export function renderSlotMedia(ctx: MediaRenderContext, slotId: string, slot: MediaSlotDef): string {
  const binding = ctx.bindings[slotId];
  if (!binding) return "";
  const asset = ctx.assets.get(binding.assetId);
  const reason = checkBinding(slot, asset);
  if (reason || !asset) {
    ctx.warnings.push(`${slotId}: media dropped (${reason ?? "asset not found"})`);
    return "";
  }
  const markup =
    asset.kind === "VIDEO"
      ? renderVideo(ctx, slotId, slot, asset, binding)
      : renderImage(ctx, slotId, slot, asset, binding);
  if (!markup) {
    ctx.warnings.push(`${slotId}: media dropped (variants unavailable)`);
    return "";
  }
  if (slot.display !== "background") return markup;
  const overlay = binding.overlay ?? slot.defaultOverlay ?? "none";
  const scrim =
    overlay === "none"
      ? ""
      : `<div aria-hidden="true" style={${JSON.stringify({ position: "absolute", inset: 0, zIndex: 1, background: OVERLAYS[overlay] })}} />`;
  return markup + scrim;
}

export function hasBoundSlot(ctx: MediaRenderContext | undefined, slotId: string): boolean {
  return !!ctx?.bindings[slotId];
}

export function createMediaContext(
  spec: Pick<SiteSpec, "media">,
  target: MediaTarget,
  assets: readonly ResolvedMediaAsset[],
): MediaRenderContext {
  return {
    target,
    bindings: spec.media ?? {},
    assets: new Map(assets.map((a) => [a.id, a])),
    warnings: [],
    files: new Map(),
    autoplayCount: 0,
  };
}

// Plays only without reduced motion/Save-Data and pauses off-screen; without JS the poster stays.
export const MEDIA_PLAYBACK_JS = `const still = matchMedia("(prefers-reduced-motion: reduce)").matches || !!(navigator.connection && navigator.connection.saveData)
const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target
    if (!e.isIntersecting) v.pause()
    else if (!still && !v.dataset.ufDone) v.play().catch(() => {})
  }
}, { threshold: 0.25 }) : null
function wire(v) {
  if (v.dataset.ufWired) return
  v.dataset.ufWired = "1"
  v.muted = true
  if (!v.loop) v.addEventListener("ended", () => { v.dataset.ufDone = "1" })
  if (io) io.observe(v)
  if (!still && (!io || v.dataset.ufPlay === "load")) v.play().catch(() => {})
}
const scan = () => document.querySelectorAll("video[data-uf-play]").forEach(wire)
new MutationObserver(scan).observe(document.body, { childList: true, subtree: true })
scan()
`;

export type { ResolvedMediaAsset, ResolvedMediaVariant };
